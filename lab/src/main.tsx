import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Badge } from '@cloudflare/kumo/components/badge';
import { Button } from '@cloudflare/kumo/components/button';
import { CloudflareLogo } from '@cloudflare/kumo/components/cloudflare-logo';
import { Input, Textarea } from '@cloudflare/kumo/components/input';
import './kumo.css';
import './styles.css';

type AgentPreset = {
  name: string;
  message: string;
};

type OutputTab = 'response' | 'raw';

type Receipt = {
  streamUrl?: string;
  offset?: string;
  submissionId?: string;
  result?: { text?: string };
};

const agents: AgentPreset[] = [
  { name: 'hello-world', message: 'Say hello and include the current agent name.' },
  { name: 'calculator', message: 'Compute 123 * 45 + 678 and explain briefly.' },
  { name: 'code-mode', message: 'Run ((18.5 * 4 - 6) / 2 + (7 * 3)) - (48 / (5 + 7)) + (9 % 4).' },
  { name: 'workspace', message: 'Reset workspace, write notes/lab.txt containing streaming lab ok, then read it back.' },
  { name: 'docs-rag', message: 'Reset docs. Ingest a document titled LabDoc with source lab://doc and text: Flue streams are read with offset and live=sse. Then search for streams and answer with a citation.' },
  { name: 'web-extractor', message: 'Extract https://example.com and summarize the title plus one useful link.' },
  { name: 'email-processor', message: 'Process this email payload: from ops@example.com, subject CSV, text https://example.com/customers.csv' },
  { name: 'memory-dispatcher', message: 'Remember that I prefer concise answers, then dispatch this: compute 19 * 6.' },
  { name: 'hybrid-data-cleaner', message: 'Use lightweight inspect on inline CSV: name,age\\nA,10\\nB, and summarize rows and missing values.' },
  { name: 'data-cleaner', message: 'Inspect CSV at https://raw.githubusercontent.com/6sinxyz/my-first-flue-agent/main/tests/fixtures/dirty_customers.csv and summarize quality issues.' },
];

function stored(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function App() {
  const [baseUrl, setBaseUrl] = useState(() => stored('flue_lab_base_url', window.location.origin));
  const [token, setToken] = useState(() => stored('flue_lab_token', ''));
  const [agent, setAgent] = useState(agents[0].name);
  const [instanceId, setInstanceId] = useState(() => `lab-${Math.floor(Date.now() / 1000)}`);
  const [message, setMessage] = useState(agents[0].message);
  const [assistantText, setAssistantText] = useState('');
  const [receipt, setReceipt] = useState('');
  const [events, setEvents] = useState<Array<{ at: number; type: string; payload: unknown }>>([]);
  const [status, setStatus] = useState('idle');
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [submission, setSubmission] = useState('no submission');
  const [aborter, setAborter] = useState<AbortController | null>(null);
  const [activeTab, setActiveTab] = useState<OutputTab>('response');

  useEffect(() => {
    window.localStorage.setItem('flue_lab_base_url', baseUrl.trim());
  }, [baseUrl]);

  useEffect(() => {
    window.localStorage.setItem('flue_lab_token', token);
  }, [token]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed(Math.round(performance.now() - started)), 120);
    return () => window.clearInterval(timer);
  }, [running, started]);

  const selectedPreset = useMemo(() => agents.find((item) => item.name === agent) ?? agents[0], [agent]);

  function applyPreset(nextAgent: string) {
    const preset = agents.find((item) => item.name === nextAgent) ?? agents[0];
    setAgent(preset.name);
    setMessage(preset.message);
  }

  function endpoint(path: string) {
    return `${baseUrl.trim().replace(/\/$/, '')}${path}`;
  }

  function requestHeaders(extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json', ...extra };
    if (token.trim()) headers.authorization = `Bearer ${token.trim()}`;
    return headers;
  }

  function resetOutput() {
    setAssistantText('');
    setReceipt('');
    setEvents([]);
    setSubmission('no submission');
    setElapsed(0);
    setActiveTab('response');
  }

  function begin() {
    const controller = new AbortController();
    setAborter(controller);
    setStarted(performance.now());
    setElapsed(0);
    setRunning(true);
    setStatus('running');
    return controller;
  }

  function end(nextStatus = 'idle') {
    setRunning(false);
    setStatus(nextStatus);
    setAborter(null);
    setElapsed(Math.round(performance.now() - started));
  }

  function log(type: string, payload: unknown) {
    setEvents((prev) => [...prev, { at: Math.round(performance.now() - (started || performance.now())), type, payload }]);
  }

  async function waitResult() {
    resetOutput();
    const controller = begin();
    try {
      const res = await fetch(endpoint(`/agents/${encodeURIComponent(agent)}/${encodeURIComponent(instanceId)}?wait=result`), {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      const text = await res.text();
      setReceipt(pretty(text));
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      const json = JSON.parse(text) as Receipt;
      setAssistantText(json.result?.text ?? '');
      setActiveTab('response');
      end(`done ${res.status}`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') fail(error);
    }
  }

  async function sendAndStream() {
    resetOutput();
    const controller = begin();
    try {
      const agentPath = `/agents/${encodeURIComponent(agent)}/${encodeURIComponent(instanceId)}`;
      const sendRes = await fetch(endpoint(agentPath), {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      const sendText = await sendRes.text();
      setReceipt(pretty(sendText));
      if (!sendRes.ok) throw new Error(`HTTP ${sendRes.status}: ${sendText}`);
      const sent = JSON.parse(sendText) as Receipt;
      setSubmission(sent.submissionId || 'submitted');
      setActiveTab('response');
      await streamSse(endpoint(`${agentPath}?offset=${encodeURIComponent(sent.offset || '-1')}&live=sse`), controller.signal);
      end('stream complete');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') fail(error);
    }
  }

  async function streamSse(url: string, signal: AbortSignal) {
    const res = await fetch(url, { method: 'GET', headers: requestHeaders({ accept: 'text/event-stream' }), signal });
    if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}: ${await res.text()}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventName = 'message';
    let dataLines: string[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line === '') {
          if (dataLines.length) {
            handlePayload(eventName, dataLines.join('\n'));
            eventName = 'message';
            dataLines = [];
          }
          continue;
        }
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        else if (line.startsWith('{')) handlePayload('json-line', line);
      }
    }
    if (dataLines.length) handlePayload(eventName, dataLines.join('\n'));
  }

  function handlePayload(eventName: string, payload: string) {
    if (!payload || payload === '[DONE]') return;
    let parsed: unknown = payload;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // Keep raw string payloads visible.
    }
    log(eventName, parsed);
    const text = extractText(parsed);
    if (text) setAssistantText((prev) => prev + text);
    const type = eventType(parsed, eventName);
    if (type === 'idle' || type === 'submission_settled') setStatus(type);
  }

  function stop() {
    aborter?.abort();
    log('client_abort', { message: 'stream aborted by user' });
    end('aborted');
  }

  function fail(error: unknown) {
    setStatus('error');
    setRunning(false);
    log('error', { message: error instanceof Error ? error.message : String(error) });
  }

  return (
    <div className="lab-shell" data-mode="light">
      <header className="lab-header">
        <div className="brand-lockup">
          <CloudflareLogo className="cf-logo" color="color" />
          <div>
            <h1>Flue Agent Streaming Lab</h1>
            <p>Test protected Flue agent streams.</p>
          </div>
        </div>
      </header>

      <main className="lab-grid">
        <section className="panel controls-panel">
          <details className="connection-settings">
            <summary>Connection & advanced settings</summary>
            <Field label="Base URL">
              <Input className="mono-input" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
            </Field>
            <Field label="Bearer token">
              <Input type="password" value={token} onChange={(event) => setToken(event.currentTarget.value)} placeholder="Paste FLUE_API_TOKEN" />
            </Field>
            <Field label="Instance ID">
              <Input className="mono-input" value={instanceId} onChange={(event) => setInstanceId(event.currentTarget.value)} />
            </Field>
          </details>

          <div className="primary-fields">
            <Field label="Agent">
              <select className="native-select" value={agent} onChange={(event) => applyPreset(event.currentTarget.value)}>
                {agents.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Prompt">
            <Textarea className="prompt-input" value={message} onChange={(event) => setMessage(event.currentTarget.value)} rows={9} />
          </Field>

          <div className="presets-header">Quick presets</div>
          <div className="preset-grid" aria-label="Agent presets">
            {agents.map((item) => (
              <Button key={item.name} type="button" variant={item.name === selectedPreset.name ? 'primary' : 'outline'} size="xs" onClick={() => applyPreset(item.name)}>
                {item.name}
              </Button>
            ))}
          </div>

          <div className="actions">
            <Button type="button" variant="primary" onClick={sendAndStream} disabled={running}>Send + stream</Button>
            <Button type="button" variant="secondary" onClick={waitResult} disabled={running}>Wait result</Button>
            {running ? <Button type="button" variant="destructive" onClick={stop}>Stop</Button> : null}
          </div>
        </section>

        <section className="panel output-panel">
          <div className="status-line">
            <span><StatusBadge status={status} /></span>
            <span className="metric">{elapsed} ms</span>
            <span className="submission-id">{submission}</span>
          </div>

          <div className="tabs" role="tablist" aria-label="Output views">
            <button type="button" role="tab" aria-selected={activeTab === 'response'} className={activeTab === 'response' ? 'active' : ''} onClick={() => setActiveTab('response')}>Response</button>
            <button type="button" role="tab" aria-selected={activeTab === 'raw'} className={activeTab === 'raw' ? 'active' : ''} onClick={() => setActiveTab('raw')}>Raw events</button>
          </div>

          <div className="tab-panel">
            {activeTab === 'response' && (
              <>
                {assistantText ? <pre className="output-pre assistant-output">{assistantText}</pre> : <Placeholder title="Waiting for response" description="Start a stream or wait for a result." />}
                {receipt ? (
                  <details className="receipt-details">
                    <summary>Receipt / result JSON</summary>
                    <pre className="receipt-pre">{receipt}</pre>
                  </details>
                ) : null}
              </>
            )}
            {activeTab === 'raw' && (
              events.length === 0 ? <Placeholder title="No stream events yet" description="Raw SSE events will appear here." /> : (
                <div className="event-list">
                  {events.map((event, index) => (
                    <article className="event-card" key={`${event.type}-${index}`}>
                      <div className="event-meta"><span>#{index + 1}</span><span>{event.at} ms</span><strong>{event.type}</strong></div>
                      <pre>{typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload, null, 2)}</pre>
                    </article>
                  ))}
                </div>
              )
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function OutputBox({ title, value, empty }: { title: string; value: string; empty: string }) {
  return (
    <div className="output-box">
      <div className="field-label">{title}</div>
      {value ? <pre>{value}</pre> : <Placeholder title={title} description={empty} />}
    </div>
  );
}


function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="placeholder">
      <div className="placeholder-title">{title}</div>
      <div className="placeholder-description">{description}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isError = status === 'error';
  const isActive = status === 'running' || status.includes('done') || status.includes('complete');
  return <Badge variant={isError ? 'red' : isActive ? 'green' : 'neutral'}><span className="status-dot" />{status}</Badge>;
}

function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function eventType(value: unknown, fallback: string) {
  return typeof value === 'object' && value !== null && 'type' in value ? String((value as { type?: unknown }).type) : fallback;
}

function extractText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const type = String(record.type ?? '');
  if ((type.includes('text') || type.includes('delta')) && typeof record.text === 'string') return record.text;
  if (typeof record.delta === 'string') return record.delta;
  if (typeof record.content === 'string' && (type.includes('message') || type.includes('text'))) return record.content;
  if (Array.isArray(record.content)) return record.content.map(extractText).join('');
  const result = record.result;
  if (result && typeof result === 'object' && 'text' in result && typeof (result as { text?: unknown }).text === 'string') return (result as { text: string }).text;
  return '';
}

createRoot(document.getElementById('root')!).render(<App />);
