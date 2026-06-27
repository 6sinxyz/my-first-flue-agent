export const STREAMING_LAB_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flue Agent Streaming Lab</title>
  <style>
    :root {
      color-scheme: light dark;
      /* Kumo/Cloudflare 7 inspired semantic tokens. Static UI avoids the React Kumo build chain. */
      --kumo-base: light-dark(#f8f8f6, #0b0b0b);
      --kumo-elevated: light-dark(#ffffff, #111111);
      --kumo-recessed: light-dark(#f5f5f3, #171717);
      --kumo-line: light-dark(#d8d8d3, #303030);
      --kumo-hairline: light-dark(rgba(0, 0, 0, 0.08), rgba(255, 255, 255, 0.10));
      --kumo-default: light-dark(#171717, #f5f5f4);
      --kumo-subtle: light-dark(#5f625d, #a7aaa4);
      --kumo-muted: light-dark(#787b74, #8e928b);
      --kumo-brand: #f48120;
      --kumo-brand-strong: #d96504;
      --kumo-accent: #0051c3;
      --kumo-accent-soft: light-dark(#e8f1ff, #0b2247);
      --kumo-success: #15803d;
      --kumo-danger: #c81e1e;
      --kumo-warning: #b45309;
      --kumo-radius-sm: 8px;
      --kumo-radius-md: 12px;
      --kumo-radius-lg: 18px;
      --kumo-shadow: 0 1px 2px rgba(0,0,0,.06), 0 12px 28px rgba(0,0,0,.06);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 12% 0%, color-mix(in srgb, var(--kumo-brand) 18%, transparent), transparent 28rem),
        radial-gradient(circle at 88% 10%, color-mix(in srgb, var(--kumo-accent) 16%, transparent), transparent 32rem),
        var(--kumo-base);
      color: var(--kumo-default);
    }
    header {
      padding: 24px clamp(16px, 4vw, 36px);
      border-bottom: 1px solid var(--kumo-hairline);
      background: color-mix(in srgb, var(--kumo-elevated) 86%, transparent);
      backdrop-filter: blur(18px);
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .brand-lockup { display: flex; align-items: center; gap: 14px; }
    .cf-mark {
      width: 44px; height: 44px; border-radius: 12px;
      display: grid; place-items: center;
      color: #111; font-weight: 950; letter-spacing: -0.08em;
      background: linear-gradient(135deg, var(--kumo-brand-strong), var(--kumo-brand));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 10px 26px color-mix(in srgb, var(--kumo-brand) 35%, transparent);
    }
    h1 { margin: 0 0 4px; font-size: clamp(22px, 3vw, 30px); letter-spacing: -0.04em; }
    header p { margin: 0; color: var(--kumo-subtle); line-height: 1.45; }
    main { display: grid; grid-template-columns: minmax(340px, 460px) 1fr; gap: 18px; padding: 18px; max-width: 1520px; margin: 0 auto; }
    section {
      background: var(--kumo-elevated);
      border: 1px solid var(--kumo-hairline);
      border-radius: var(--kumo-radius-lg);
      padding: 20px;
      box-shadow: var(--kumo-shadow);
    }
    .panel-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    label { display: block; font-size: 13px; font-weight: 650; color: var(--kumo-subtle); letter-spacing: 0; margin: 16px 0 6px; }
    input, select, textarea, button {
      width: 100%; border: 1px solid var(--kumo-line); border-radius: var(--kumo-radius-md);
      background: light-dark(#ffffff, var(--kumo-recessed)); color: var(--kumo-default); padding: 10px 12px; font: inherit;
      outline: none; transition: border-color .15s ease, box-shadow .15s ease, background .15s ease, transform .08s ease;
    }
    input:focus, select:focus, textarea:focus { border-color: var(--kumo-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--kumo-accent) 20%, transparent); }
    textarea { min-height: 128px; resize: vertical; line-height: 1.45; }
    button {
      cursor: pointer; font-weight: 700; background: var(--kumo-brand); color: white; border-color: transparent;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.28), 0 8px 18px color-mix(in srgb, var(--kumo-brand) 20%, transparent);
    }
    button:hover:not(:disabled) { transform: translateY(-1px); background: var(--kumo-brand-strong); }
    button.secondary { background: var(--kumo-elevated); color: var(--kumo-default); border: 1px solid var(--kumo-line); box-shadow: none; }
    button.secondary:hover:not(:disabled) { background: var(--kumo-accent-soft); }
    button.danger { background: transparent; color: var(--kumo-danger); border: 1px solid color-mix(in srgb, var(--kumo-danger) 48%, var(--kumo-line)); box-shadow: none; }
    button.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--kumo-danger) 10%, transparent); }
    button:disabled { opacity: .55; cursor: not-allowed; transform: none; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: end; }
    .actions { display: grid; grid-template-columns: 1.2fr 1fr .8fr; gap: 12px; margin-top: 16px; }
    .hint { color: var(--kumo-subtle); font-size: 12px; margin-top: 8px; line-height: 1.55; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px;
      border: 1px solid var(--kumo-hairline); border-radius: 999px; color: var(--kumo-subtle);
      background: var(--kumo-recessed); font-size: 12px; line-height: 1.2;
    }
    .badge.brand { color: white; border-color: transparent; background: var(--kumo-brand); font-weight: 750; }
    .status-ok { color: var(--kumo-success); }
    .status-bad { color: var(--kumo-danger); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    pre {
      white-space: pre-wrap; word-break: break-word; background: light-dark(#ffffff, var(--kumo-recessed)); color: var(--kumo-default);
      border: 1px dashed var(--kumo-line); border-radius: var(--kumo-radius-md); padding: 12px; margin: 0;
      max-height: 520px; overflow: auto; font-size: 12px; line-height: 1.45;
    }
    code { color: var(--kumo-default); background: var(--kumo-recessed); border: 1px solid var(--kumo-hairline); border-radius: 6px; padding: 1px 4px; }
    #assistantText { min-height: 220px; font-size: 14px; }
    #events { min-height: 500px; background: light-dark(#ffffff, #111111); }
    pre:empty::before { content: attr(data-empty); color: var(--kumo-muted); }
    .event { border-bottom: 1px solid var(--kumo-hairline); padding: 8px 0; }
    .event strong { color: var(--kumo-accent); }
    .event small { color: var(--kumo-muted); }
    .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
    .toolbar button { width: auto; padding: 7px 10px; font-size: 12px; }
    .status-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--kumo-muted); display: inline-block; }
    .status-ok .status-dot { background: var(--kumo-success); }
    .metric { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @media (max-width: 980px) { main, .grid { grid-template-columns: 1fr; } header { position: static; } }
  </style>
</head>
<body>
  <header>
    <div class="brand-row">
      <div class="brand-lockup">
        <div class="cf-mark" aria-hidden="true">CF</div>
        <div>
          <h1>Flue Agent Streaming Lab</h1>
          <p>Cloudflare/Kumo-inspired streaming console for protected Flue agent streams. Token stays in this browser only.</p>
        </div>
      </div>
      <span class="badge brand">Cloudflare Worker</span>
    </div>
  </header>
  <main>
    <section>
      <div class="panel-title"><span class="badge brand">Kumo-style lab</span><span class="badge">fetch streaming + Bearer auth</span></div>
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
        <span class="badge" id="status"><span class="status-dot"></span> idle</span>
        <span class="badge metric" id="timing">0 ms</span>
        <span class="badge" id="submission">no submission</span>
      </div>
      <div class="grid" style="margin-top: 14px;">
        <div>
          <label>Assistant text / extracted stream content</label>
          <pre id="assistantText" data-empty="Assistant text will appear here as stream events arrive."></pre>
        </div>
        <div>
          <label>Receipt / result JSON</label>
          <pre id="receipt" data-empty="Submission receipt or wait=result JSON will appear here."></pre>
        </div>
      </div>
      <label>Raw stream events</label>
      <pre id="events" data-empty="Raw SSE events will appear here. Start a stream to inspect event timing and payloads."></pre>
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
      $('status').innerHTML = '<span class="status-dot"></span> ' + (running ? 'running' : 'idle');
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
        $('status').innerHTML = '<span class="status-dot"></span> done ' + res.status;
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
        $('status').innerHTML = '<span class="status-dot"></span> stream complete';
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
      if (type === 'idle' || type === 'submission_settled') $('status').innerHTML = '<span class="status-dot"></span> ' + type;
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
      $('status').innerHTML = '<span class="status-dot"></span> error';
      $('status').className = 'badge status-bad';
      logEvent('error', { message: error && error.message ? error.message : String(error) });
    }

    init();
  </script>
</body>
</html>`;
