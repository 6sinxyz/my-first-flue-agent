import React, { useEffect, useMemo, useRef, useState } from 'react';
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

type Receipt = {
  streamUrl?: string;
  offset?: string;
  submissionId?: string;
  result?: { text?: string };
};

type RawEvent = { at: number; type: string; payload: unknown };
type TranscriptItem =
  | { id: string; kind: 'user'; agent: string; text: string; at: number }
  | { id: string; kind: 'assistant'; text: string; status: 'streaming' | 'complete' | 'error' | 'aborted'; at: number }
  | { id: string; kind: 'tool'; type: string; payload: unknown; at: number };

const PROD_URL = 'https://my-first-flue-agent.thecatcner.workers.dev';

const agents: AgentPreset[] = [
  { name: 'hello-world', message: 'Say hello and include the current agent name.' },
  { name: 'calculator', message: 'Compute 123 * 45 + 678 and explain briefly.' },
  { name: 'code-mode', message: 'Run ((18.5 * 4 - 6) / 2 + (7 * 3)) - (48 / (5 + 7)) + (9 % 4).' },
  { name: 'workspace', message: 'Reset workspace, write notes/lab.txt containing streaming lab ok, then read it back.' },
  { name: 'docs-rag', message: 'Reset docs. Ingest a document titled LabDoc with source lab://doc and text: Flue streams are read with offset and live=sse. Then search for streams and answer with a citation.' },
  { name: 'web-extractor', message: 'Extract https://example.com and summarize the title plus one useful link.' },
  { name: 'email-processor', message: 'Process this test email payload: from ops@example.com, subject CSV attachment, text Please inspect the attached CSV, attachments: [{ filename: customers.csv, content_type: text/csv, content: name,email\nAda,ada@example.com\nBob,bob@example.com }]。Return detected attachments and the data-cleaner handoff prompt.' },
  { name: 'memory-dispatcher', message: 'Remember that I prefer concise answers, then dispatch this: compute 19 * 6.' },
  { name: 'hybrid-data-cleaner', message: 'Use lightweight inspect on inline CSV: name,age\nA,10\nB, and summarize rows and missing values.' },
  { name: 'data-cleaner', message: 'Inspect CSV at https://raw.githubusercontent.com/6sinxyz/my-first-flue-agent/main/tests/fixtures/dirty_customers.csv and summarize quality issues.' },
];

function stored(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function App() {
  const [baseUrl, setBaseUrl] = useState(() => stored('flue_lab_base_url', PROD_URL));
  const [token, setToken] = useState(() => stored('flue_lab_token', ''));
  const [agent, setAgent] = useState(agents[0].name);
  const [instanceId, setInstanceId] = useState(() => `lab-${Math.floor(Date.now() / 1000)}`);
  const [message, setMessage] = useState(agents[0].message);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [receipt, setReceipt] = useState('');
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [status, setStatus] = useState('idle');
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [submission, setSubmission] = useState('');
  const [aborter, setAborter] = useState<AbortController | null>(null);
  const [copied, setCopied] = useState('');
  const startedRef = useRef(0);
  const currentAssistantRef = useRef<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem('flue_lab_base_url', baseUrl.trim());
  }, [baseUrl]);

  useEffect(() => {
    window.localStorage.setItem('flue_lab_token', token);
  }, [token]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setElapsed(Math.round(performance.now() - (startedRef.current || started))), 120);
    return () => window.clearInterval(timer);
  }, [running, started]);

  const selectedPreset = useMemo(() => agents.find((item) => item.name === agent) ?? agents[0], [agent]);
  const usesProduction = baseUrl.trim().replace(/\/$/, '') === PROD_URL;
  const visibleEvents = events.slice(-80);
  const visibleEventOffset = events.length - visibleEvents.length;
  const toolEvents = events.filter((event) => isToolEvent(event.type, event.payload));
  const latestAssistantText = latestAssistant(transcript)?.text ?? '';

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
    setTranscript([]);
    setReceipt('');
    setEvents([]);
    setSubmission('');
    setElapsed(0);
    currentAssistantRef.current = null;
  }

  function begin() {
    const controller = new AbortController();
    setAborter(controller);
    const now = performance.now();
    startedRef.current = now;
    setStarted(now);
    setElapsed(0);
    setRunning(true);
    setStatus('running');
    return controller;
  }

  function end(nextStatus = 'idle') {
    setRunning(false);
    setStatus(nextStatus);
    setAborter(null);
    const origin = startedRef.current || started;
    setElapsed(Math.round(performance.now() - origin));
    markAssistantStatus(nextStatus === 'aborted' ? 'aborted' : nextStatus === 'error' ? 'error' : 'complete');
  }

  function log(type: string, payload: unknown) {
    const origin = startedRef.current || started || performance.now();
    setEvents((prev) => [...prev, { at: Math.round(performance.now() - origin), type, payload }]);
  }

  function startTranscript(userText: string) {
    const now = Date.now();
    const userId = `user-${now}`;
    const assistantId = `assistant-${now}`;
    currentAssistantRef.current = assistantId;
    setTranscript([
      { id: userId, kind: 'user', agent, text: userText, at: 0 },
      { id: assistantId, kind: 'assistant', text: '', status: 'streaming', at: 0 },
    ]);
  }

  function appendAssistantText(text: string) {
    const id = currentAssistantRef.current;
    if (!id) return;
    setTranscript((prev) => prev.map((item) => item.kind === 'assistant' && item.id === id ? { ...item, text: item.text + text } : item));
  }

  function setAssistantText(text: string) {
    const id = currentAssistantRef.current;
    if (!id) return;
    setTranscript((prev) => prev.map((item) => item.kind === 'assistant' && item.id === id ? { ...item, text } : item));
  }

  function markAssistantStatus(nextStatus: 'streaming' | 'complete' | 'error' | 'aborted') {
    const id = currentAssistantRef.current;
    if (!id) return;
    setTranscript((prev) => prev.map((item) => item.kind === 'assistant' && item.id === id ? { ...item, status: nextStatus } : item));
  }

  function upsertToolEvent(type: string, payload: unknown) {
    const callId = toolEventCallId(payload);
    const id = `tool-${callId}`;
    setTranscript((prev) => {
      const existing = prev.findIndex((item) => item.kind === 'tool' && item.id === id);
      const next: TranscriptItem = { id, kind: 'tool', type, payload, at: Math.round(performance.now() - (startedRef.current || started || performance.now())) };
      if (existing === -1) return [...prev, next];
      return prev.map((item, index) => index === existing ? next : item);
    });
  }

  async function copyValue(label: string, value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => current === label ? '' : current), 1600);
  }

  async function runMessage(wait: boolean) {
    const prompt = message.trim();
    if (!prompt) return;
    resetOutput();
    startTranscript(prompt);
    const controller = begin();
    try {
      const agentPath = `/agents/${encodeURIComponent(agent)}/${encodeURIComponent(instanceId)}`;
      const path = wait ? `${agentPath}?wait=result` : agentPath;
      const res = await fetch(endpoint(path), {
        method: 'POST',
        headers: requestHeaders(),
        body: JSON.stringify({ message: prompt }),
        signal: controller.signal,
      });
      const text = await res.text();
      setReceipt(pretty(text));
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      const sent = JSON.parse(text) as Receipt;
      setSubmission(sent.submissionId || 'submitted');
      if (wait) {
        setAssistantText(sent.result?.text ?? '');
        end(`done ${res.status}`);
        return;
      }
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
            const terminal = await handlePayload(eventName, dataLines.join('\n'));
            eventName = 'message';
            dataLines = [];
            if (terminal) {
              await reader.cancel().catch(() => undefined);
              return;
            }
          }
          continue;
        }
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
        else if (line.startsWith('{') || line.startsWith('[')) {
          if (await handlePayload('json-line', line)) {
            await reader.cancel().catch(() => undefined);
            return;
          }
        }
      }
    }
    if (dataLines.length) await handlePayload(eventName, dataLines.join('\n'));
  }

  async function handlePayload(eventName: string, payload: string): Promise<boolean> {
    if (!payload || payload === '[DONE]') return false;
    let parsed: unknown = payload;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // Keep raw string payloads visible.
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    let terminal = false;
    for (const item of items) {
      const type = eventType(item, eventName);
      log(type, item);
      if (isToolEvent(type, item)) upsertToolEvent(type, item);
      const text = extractText(item);
      if (text) appendAssistantText(text);
      if (type === 'idle' || type === 'submission_settled') {
        setStatus(type);
        terminal = true;
      }
    }
    return terminal;
  }

  function stop() {
    aborter?.abort();
    log('client_abort', { message: 'stream aborted by user' });
    end('aborted');
  }

  function fail(error: unknown) {
    setStatus('error');
    setRunning(false);
    markAssistantStatus('error');
    log('error', { message: error instanceof Error ? error.message : String(error) });
  }

  return (
    <div className="lab-shell" data-mode="light">
      <header className="lab-header">
        <div className="brand-lockup">
          <CloudflareLogo className="cf-logo" color="color" />
          <div>
            <h1>Flue Agent Streaming Lab</h1>
            <p>Chat with protected Flue agents and inspect their streams.</p>
          </div>
        </div>
      </header>

      <main className="lab-grid chat-layout">
        <aside className="panel controls-panel config-panel">
          <div className="sidebar-section">
            <div className="eyebrow">Configuration</div>
            <Field label="Agent">
              <select className="native-select" value={agent} onChange={(event) => applyPreset(event.currentTarget.value)}>
                {agents.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="sidebar-section">
            <div className="field-label">Presets</div>
            <div className="preset-strip preset-stack" aria-label="Agent presets">
              {agents.map((item) => (
                <Button key={item.name} type="button" variant={item.name === selectedPreset.name ? 'primary' : 'outline'} size="xs" onClick={() => applyPreset(item.name)}>
                  {item.name}
                </Button>
              ))}
            </div>
          </div>

          {!usesProduction ? (
            <div className="preview-warning">
              <span>Remote preview is for the UI only. Agent calls should target production.</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => setBaseUrl(PROD_URL)}>Use production</Button>
            </div>
          ) : null}

          <details className="connection-settings advanced-settings">
            <summary>Connection & advanced settings</summary>
            <Field label="Base URL">
              <div className="base-url-row">
                <Input className="mono-input" value={baseUrl} onChange={(event) => setBaseUrl(event.currentTarget.value)} />
                <Button type="button" variant="secondary" size="sm" onClick={() => setBaseUrl(PROD_URL)}>Use production</Button>
              </div>
            </Field>
            <Field label="Bearer token">
              <Input type="password" value={token} onChange={(event) => setToken(event.currentTarget.value)} placeholder="Paste FLUE_API_TOKEN" />
            </Field>
            <Field label="Instance ID">
              <Input className="mono-input" value={instanceId} onChange={(event) => setInstanceId(event.currentTarget.value)} />
            </Field>
          </details>
        </aside>

        <section className="panel chat-panel">
          <div className="chat-header">
            <div>
              <div className="eyebrow">Chat playground</div>
              <h2>{selectedPreset.name}</h2>
            </div>
            <div className="output-actions">
              <Button type="button" variant="secondary" size="sm" disabled={!latestAssistantText} onClick={() => copyValue('response', latestAssistantText)}>{copied === 'response' ? 'Copied' : 'Copy response'}</Button>
              <Button type="button" variant="secondary" size="sm" disabled={!receipt} onClick={() => copyValue('receipt', receipt)}>{copied === 'receipt' ? 'Copied' : 'Copy JSON'}</Button>
              <Button type="button" variant="secondary" size="sm" disabled={events.length === 0} onClick={() => copyValue('events', JSON.stringify(events, null, 2))}>{copied === 'events' ? 'Copied' : 'Copy events'}</Button>
            </div>
          </div>

          <RunStatusBar status={status} elapsed={elapsed} events={events.length} tools={toolEvents.length} submission={submission} />

          <Transcript transcript={transcript} running={running} />

          <div className="composer">
            <Textarea className="composer-input" value={message} onChange={(event) => setMessage(event.currentTarget.value)} rows={4} placeholder="Ask the selected agent…" />
            <div className="composer-actions">
              {running ? <Button type="button" variant="destructive" onClick={stop}>Stop stream</Button> : <Button type="button" variant="primary" onClick={() => runMessage(false)}>Send + stream</Button>}
              <Button type="button" variant="secondary" onClick={() => runMessage(true)} disabled={running}>Send + wait</Button>
            </div>
          </div>

          <details className="debug-drawer">
            <summary>
              <span>Debug drawer</span>
              <span>{events.length} raw events · {toolEvents.length} tool events</span>
            </summary>
            <div className="debug-grid">
              <div className="debug-section">
                <div className="response-card-head"><span>Tool events</span></div>
                {toolEvents.length === 0 ? <Placeholder title="No tool calls yet" description="Tool calls appear inline in the transcript and here for debugging." /> : (
                  <div className="tool-list compact-list">
                    {toolEvents.slice(-24).map((event, index) => <ToolCard key={`${event.type}-${index}`} event={event} index={Math.max(0, toolEvents.length - 24) + index} compact />)}
                  </div>
                )}
              </div>
              <div className="debug-section">
                <div className="response-card-head"><span>Raw events</span><span className="event-count-pill">latest {visibleEvents.length}</span></div>
                {events.length === 0 ? <Placeholder title="No stream events yet" description="Raw SSE events will appear here." /> : (
                  <div className="event-list compact-list">
                    {visibleEvents.map((event, index) => (
                      <article className="event-card" key={`${event.type}-${visibleEventOffset + index}`}>
                        <div className="event-meta"><span>#{visibleEventOffset + index + 1}</span><span>{event.at} ms</span><strong>{event.type}</strong></div>
                        <pre>{typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload, null, 2)}</pre>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {receipt ? (
              <details className="receipt-details">
                <summary><span>Receipt / result JSON</span><span>Inspect request receipt</span></summary>
                <pre className="receipt-pre">{receipt}</pre>
              </details>
            ) : null}
          </details>
        </section>
      </main>
    </div>
  );
}

function RunStatusBar({ status, elapsed, events, tools, submission }: { status: string; elapsed: number; events: number; tools: number; submission: string }) {
  return (
    <div className="status-strip" aria-label="Run status">
      <div className="status-pill"><span>Status</span><StatusBadge status={status} /></div>
      <div className="status-pill"><span>Elapsed</span><strong>{formatElapsed(elapsed)}</strong></div>
      <div className="status-pill"><span>Events</span><strong>{events}</strong></div>
      <div className="status-pill"><span>Tools</span><strong>{tools}</strong></div>
      <div className="status-pill submission-pill"><span>Submission</span><code title={submission || '—'}>{submission || '—'}</code></div>
    </div>
  );
}

function Transcript({ transcript, running }: { transcript: TranscriptItem[]; running: boolean }) {
  if (transcript.length === 0) {
    return <div className="transcript empty-transcript"><Placeholder title="Start a conversation" description="Send a prompt to see the agent stream responses, tool calls, and debug metadata." /></div>;
  }
  return (
    <div className="transcript" aria-live="polite">
      {transcript.map((item, index) => {
        if (item.kind === 'user') return <UserMessage key={item.id} item={item} />;
        if (item.kind === 'assistant') return <AssistantMessage key={item.id} item={item} running={running && index === transcript.length - 1} />;
        return <ToolCard key={item.id} event={{ at: item.at, type: item.type, payload: item.payload }} index={index} />;
      })}
    </div>
  );
}

function UserMessage({ item }: { item: Extract<TranscriptItem, { kind: 'user' }> }) {
  return (
    <article className="message-row user-row">
      <div className="message-bubble user-bubble">
        <div className="message-meta"><span>User</span><code>{item.agent}</code></div>
        <pre>{item.text}</pre>
      </div>
    </article>
  );
}

function AssistantMessage({ item, running }: { item: Extract<TranscriptItem, { kind: 'assistant' }>; running: boolean }) {
  return (
    <article className="message-row assistant-row">
      <div className="message-bubble assistant-bubble">
        <div className="message-meta"><span>Assistant</span>{item.status === 'streaming' || running ? <span className="streaming-indicator">Streaming…</span> : <Badge variant={item.status === 'error' ? 'red' : item.status === 'aborted' ? 'neutral' : 'green'}>{item.status}</Badge>}</div>
        {item.text ? <pre>{item.text}</pre> : <div className="typing-placeholder">Waiting for first token…</div>}
      </div>
    </article>
  );
}

function ToolCard({ event, index, compact = false }: { event: RawEvent; index: number; compact?: boolean }) {
  return (
    <article className={`${toolEventClass(event.type)} tool-card ${compact ? 'compact' : ''}`}>
      <div className="tool-meta">
        <span>#{index + 1}</span>
        <span>{event.at} ms</span>
        <strong>{toolEventName(event.payload)}</strong>
        <Badge variant={event.type === 'tool_start' ? 'neutral' : 'green'}>{event.type === 'tool_start' ? 'running' : 'completed'}</Badge>
      </div>
      <code>{toolEventCallId(event.payload)}</code>
      <p>{toolEventSummary(event.payload)}</p>
    </article>
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

function latestAssistant(items: TranscriptItem[]) {
  return [...items].reverse().find((item): item is Extract<TranscriptItem, { kind: 'assistant' }> => item.kind === 'assistant');
}

function isToolEvent(type: string, payload: unknown) {
  if (type === 'tool_start' || type === 'tool') return true;
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  return typeof record.toolName === 'string' || typeof record.toolCallId === 'string';
}

function toolEventName(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'tool';
  const record = payload as Record<string, unknown>;
  return String(record.toolName ?? record.name ?? 'tool').replace(/^functions\./, '');
}

function toolEventCallId(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'no call id';
  const record = payload as Record<string, unknown>;
  return String(record.toolCallId ?? record.callId ?? record.id ?? 'no call id');
}

function toolEventClass(type: string) {
  return `tool-item ${type === 'tool_start' ? 'is-running' : 'is-complete'}`;
}

function toolEventSummary(payload: unknown) {
  if (!payload || typeof payload !== 'object') return 'Tool event received.';
  const record = payload as Record<string, unknown>;
  const result = record.result;
  if (result && typeof result === 'object') {
    const details = (result as { details?: unknown }).details;
    if (details && typeof details === 'object' && 'output' in details) return compactJson((details as { output?: unknown }).output);
    if ('content' in result) return compactJson((result as { content?: unknown }).content);
  }
  if (result !== undefined) return compactJson(result);
  const args = record.args ?? record.arguments ?? record.input;
  if (args !== undefined) return compactJson(args);
  return 'Tool call started.';
}

function compactJson(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return 'No output.';
  return text.length > 260 ? `${text.slice(0, 260)}…` : text;
}

function formatElapsed(ms: number) {
  if (!ms) return '0 ms';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function eventType(value: unknown, fallback: string) {
  if (typeof value === 'object' && value !== null) {
    if ('type' in value) return String((value as { type?: unknown }).type);
    if ('streamNextOffset' in value) return 'control';
  }
  return fallback;
}

function extractText(value: unknown): string {
  if (Array.isArray(value)) return value.map(extractText).join('');
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const type = String(record.type ?? '');

  if (type === 'text_delta') {
    if (typeof record.text === 'string') return record.text;
    if (typeof record.delta === 'string') return record.delta;
  }
  if ((type === 'text' || type === 'message_text') && typeof record.text === 'string') return record.text;
  return '';
}

createRoot(document.getElementById('root')!).render(<App />);
