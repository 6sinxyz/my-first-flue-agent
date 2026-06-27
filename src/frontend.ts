export const STREAMING_LAB_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flue Agent Streaming Lab</title>
  <style>
    :root { color-scheme: dark; --bg: #080b12; --panel: #111827; --muted: #94a3b8; --text: #e5e7eb; --accent: #60a5fa; --ok: #34d399; --bad: #fb7185; --border: #263244; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #172554, var(--bg) 42rem); color: var(--text); }
    header { padding: 24px; border-bottom: 1px solid var(--border); background: rgba(8, 11, 18, 0.78); backdrop-filter: blur(14px); position: sticky; top: 0; z-index: 2; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    header p { margin: 0; color: var(--muted); }
    main { display: grid; grid-template-columns: minmax(340px, 460px) 1fr; gap: 18px; padding: 18px; max-width: 1500px; margin: 0 auto; }
    section { background: rgba(17, 24, 39, 0.9); border: 1px solid var(--border); border-radius: 16px; padding: 16px; box-shadow: 0 20px 55px rgba(0, 0, 0, 0.25); }
    label { display: block; font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin: 13px 0 6px; }
    input, select, textarea, button { width: 100%; border: 1px solid var(--border); border-radius: 10px; background: #0b1220; color: var(--text); padding: 10px 12px; font: inherit; }
    textarea { min-height: 128px; resize: vertical; line-height: 1.45; }
    button { cursor: pointer; font-weight: 800; background: linear-gradient(135deg, #2563eb, #7c3aed); border: 0; }
    button.secondary { background: #1f2937; border: 1px solid var(--border); }
    button.danger { background: #7f1d1d; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 14px; }
    .hint { color: var(--muted); font-size: 12px; margin-top: 8px; line-height: 1.5; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 12px; margin-right: 6px; }
    .status-ok { color: var(--ok); }
    .status-bad { color: var(--bad); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #020617; border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin: 0; max-height: 520px; overflow: auto; font-size: 12px; line-height: 1.45; }
    #assistantText { min-height: 220px; font-size: 14px; }
    #events { min-height: 500px; }
    .event { border-bottom: 1px solid #1f2937; padding: 8px 0; }
    .event strong { color: var(--accent); }
    .event small { color: var(--muted); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
    .toolbar button { width: auto; padding: 7px 10px; font-size: 12px; }
    @media (max-width: 980px) { main, .grid { grid-template-columns: 1fr; } header { position: static; } }
  </style>
</head>
<body>
  <header>
    <h1>Flue Agent Streaming Lab</h1>
    <p>Same-origin Cloudflare Worker UI for testing protected Flue agent streams. Token stays in this browser only.</p>
  </header>
  <main>
    <section>
      <div class="badge">Best practice: use <code>fetch</code> streaming, not EventSource, so Authorization headers are sent.</div>
      <label for="baseUrl">Base URL</label>
      <input id="baseUrl" placeholder="https://my-first-flue-agent.thecatcner.workers.dev" />
      <label for="token">Bearer token</label>
      <input id="token" type="password" autocomplete="off" placeholder="Paste FLUE_API_TOKEN" />
      <div class="row">
        <div>
          <label for="agent">Agent</label>
          <select id="agent"></select>
        </div>
        <div>
          <label for="instanceId">Instance id</label>
          <input id="instanceId" />
        </div>
      </div>
      <label for="message">Prompt</label>
      <textarea id="message"></textarea>
      <div class="toolbar" id="presets"></div>
      <div class="actions">
        <button id="streamBtn">Send + stream</button>
        <button class="secondary" id="waitBtn">Wait result</button>
        <button class="danger" id="stopBtn" disabled>Stop</button>
      </div>
      <p class="hint">The streaming path uses <code>POST /agents/:name/:id</code>, then <code>GET /agents/:name/:id?offset=&lt;offset&gt;&live=sse</code>. Tokens are stored in <code>localStorage</code> only when you type them here.</p>
    </section>

    <section>
      <div class="toolbar">
        <span class="badge" id="status">idle</span>
        <span class="badge" id="timing">0 ms</span>
        <span class="badge" id="submission">no submission</span>
      </div>
      <div class="grid" style="margin-top: 14px;">
        <div>
          <label>Assistant text / extracted stream content</label>
          <pre id="assistantText"></pre>
        </div>
        <div>
          <label>Receipt / result JSON</label>
          <pre id="receipt"></pre>
        </div>
      </div>
      <label>Raw stream events</label>
      <pre id="events"></pre>
    </section>
  </main>

  <script>
    const agents = [
      { name: 'hello-world', message: 'Say hello and include the current agent name.' },
      { name: 'calculator', message: 'Compute 123 * 45 + 678 and explain briefly.' },
      { name: 'code-mode', message: 'Run ((18.5 * 4 - 6) / 2 + (7 * 3)) - (48 / (5 + 7)) + (9 % 4).' },
      { name: 'workspace', message: 'Reset workspace, write notes/lab.txt containing streaming lab ok, then read it back.' },
      { name: 'docs-rag', message: 'Reset docs. Ingest a document titled LabDoc with source lab://doc and text: Flue streams are read with offset and live=sse. Then search for streams and answer with a citation.' },
      { name: 'web-extractor', message: 'Extract https://example.com and summarize the title plus one useful link.' },
      { name: 'email-processor', message: 'Process this email payload: from ops@example.com, subject CSV, text https://example.com/customers.csv' },
      { name: 'memory-dispatcher', message: 'Remember that I prefer concise answers, then dispatch this: compute 19 * 6.' },
      { name: 'hybrid-data-cleaner', message: 'Use lightweight inspect on inline CSV: name,age\\nA,10\\nB, and summarize rows and missing values.' },
      { name: 'data-cleaner', message: 'Inspect CSV at https://raw.githubusercontent.com/6sinxyz/my-first-flue-agent/main/tests/fixtures/dirty_customers.csv and summarize quality issues.' }
    ];

    const $ = (id) => document.getElementById(id);
    const state = { abort: null, started: 0, timer: null, eventCount: 0 };

    function init() {
      $('baseUrl').value = localStorage.getItem('flue_lab_base_url') || location.origin;
      $('token').value = localStorage.getItem('flue_lab_token') || '';
      $('instanceId').value = 'lab-' + Math.floor(Date.now() / 1000);
      for (const agent of agents) {
        const opt = document.createElement('option');
        opt.value = agent.name;
        opt.textContent = agent.name;
        $('agent').appendChild(opt);
      }
      $('agent').addEventListener('change', applyAgentPreset);
      $('baseUrl').addEventListener('input', () => localStorage.setItem('flue_lab_base_url', $('baseUrl').value.trim()));
      $('token').addEventListener('input', () => localStorage.setItem('flue_lab_token', $('token').value));
      $('streamBtn').addEventListener('click', sendAndStream);
      $('waitBtn').addEventListener('click', waitResult);
      $('stopBtn').addEventListener('click', stop);
      for (const agent of agents) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'secondary';
        btn.textContent = agent.name;
        btn.addEventListener('click', () => { $('agent').value = agent.name; applyAgentPreset(); });
        $('presets').appendChild(btn);
      }
      applyAgentPreset();
    }

    function applyAgentPreset() {
      const preset = agents.find((a) => a.name === $('agent').value);
      if (preset) $('message').value = preset.message;
    }

    function endpoint(path) {
      const base = $('baseUrl').value.trim().replace(/\/$/, '');
      return base + path;
    }

    function headers(extra) {
      const token = $('token').value.trim();
      const base = { 'content-type': 'application/json', 'accept': 'application/json' };
      if (token) base.authorization = 'Bearer ' + token;
      return Object.assign(base, extra || {});
    }

    function setRunning(running) {
      $('streamBtn').disabled = running;
      $('waitBtn').disabled = running;
      $('stopBtn').disabled = !running;
      $('status').textContent = running ? 'running' : 'idle';
      $('status').className = running ? 'badge status-ok' : 'badge';
    }

    function resetOutput() {
      $('assistantText').textContent = '';
      $('receipt').textContent = '';
      $('events').textContent = '';
      $('submission').textContent = 'no submission';
      state.eventCount = 0;
    }

    function startTimer() {
      state.started = performance.now();
      clearInterval(state.timer);
      state.timer = setInterval(() => {
        $('timing').textContent = Math.round(performance.now() - state.started) + ' ms';
      }, 120);
    }

    function stopTimer() {
      clearInterval(state.timer);
      $('timing').textContent = Math.round(performance.now() - state.started) + ' ms';
    }

    function stop() {
      if (state.abort) state.abort.abort();
      setRunning(false);
      stopTimer();
      logEvent('client_abort', { message: 'stream aborted by user' });
    }

    async function waitResult() {
      resetOutput();
      setRunning(true);
      startTimer();
      state.abort = new AbortController();
      try {
        const agent = encodeURIComponent($('agent').value);
        const id = encodeURIComponent($('instanceId').value.trim() || 'lab');
        const res = await fetch(endpoint('/agents/' + agent + '/' + id + '?wait=result'), {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ message: $('message').value }),
          signal: state.abort.signal
        });
        const text = await res.text();
        $('receipt').textContent = pretty(text);
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text);
        const json = JSON.parse(text);
        $('assistantText').textContent = json.result && json.result.text ? json.result.text : '';
        $('status').textContent = 'done ' + res.status;
      } catch (error) {
        fail(error);
      } finally {
        setRunning(false);
        stopTimer();
      }
    }

    async function sendAndStream() {
      resetOutput();
      setRunning(true);
      startTimer();
      state.abort = new AbortController();
      try {
        const agent = encodeURIComponent($('agent').value);
        const id = encodeURIComponent($('instanceId').value.trim() || 'lab');
        const sendRes = await fetch(endpoint('/agents/' + agent + '/' + id), {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ message: $('message').value }),
          signal: state.abort.signal
        });
        const sendText = await sendRes.text();
        $('receipt').textContent = pretty(sendText);
        if (!sendRes.ok) throw new Error('HTTP ' + sendRes.status + ': ' + sendText);
        const receipt = JSON.parse(sendText);
        $('submission').textContent = receipt.submissionId || 'submitted';
        const offset = encodeURIComponent(receipt.offset || '-1');
        const streamPath = '/agents/' + agent + '/' + id + '?offset=' + offset + '&live=sse';
        await streamSse(endpoint(streamPath));
        $('status').textContent = 'stream complete';
      } catch (error) {
        if (error && error.name !== 'AbortError') fail(error);
      } finally {
        setRunning(false);
        stopTimer();
      }
    }

    async function streamSse(url) {
      const res = await fetch(url, {
        method: 'GET',
        headers: headers({ accept: 'text/event-stream' }),
        signal: state.abort.signal
      });
      if (!res.ok || !res.body) throw new Error('stream HTTP ' + res.status + ': ' + await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = 'message';
      let dataLines = [];
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line === '') {
            if (dataLines.length) {
              const payload = dataLines.join('\n');
              handlePayload(eventName, payload);
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

    function handlePayload(eventName, payload) {
      if (!payload || payload === '[DONE]') return;
      let parsed = payload;
      try { parsed = JSON.parse(payload); } catch (_) {}
      logEvent(eventName, parsed);
      const text = extractText(parsed);
      if (text) $('assistantText').textContent += text;
      const type = parsed && typeof parsed === 'object' ? (parsed.type || parsed.event || eventName) : eventName;
      if (type === 'idle' || type === 'submission_settled') $('status').textContent = type;
    }

    function extractText(value) {
      if (!value || typeof value !== 'object') return '';
      const type = value.type || '';
      if ((type.includes('text') || type.includes('delta')) && typeof value.text === 'string') return value.text;
      if (typeof value.delta === 'string') return value.delta;
      if (typeof value.content === 'string' && (type.includes('message') || type.includes('text'))) return value.content;
      if (Array.isArray(value.content)) return value.content.map(extractText).join('');
      if (value.result && typeof value.result.text === 'string') return value.result.text;
      return '';
    }

    function logEvent(eventName, payload) {
      state.eventCount += 1;
      const type = payload && typeof payload === 'object' ? (payload.type || payload.event || eventName) : eventName;
      const div = document.createElement('div');
      div.className = 'event';
      const small = document.createElement('small');
      small.textContent = '#' + state.eventCount + ' +' + Math.round(performance.now() - state.started) + 'ms';
      const strong = document.createElement('strong');
      strong.textContent = ' ' + type;
      const pre = document.createElement('pre');
      pre.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
      div.appendChild(small);
      div.appendChild(strong);
      div.appendChild(pre);
      $('events').appendChild(div);
      $('events').scrollTop = $('events').scrollHeight;
    }

    function pretty(text) {
      try { return JSON.stringify(JSON.parse(text), null, 2); } catch (_) { return text; }
    }

    function fail(error) {
      $('status').textContent = 'error';
      $('status').className = 'badge status-bad';
      logEvent('error', { message: error && error.message ? error.message : String(error) });
    }

    init();
  </script>
</body>
</html>`;
