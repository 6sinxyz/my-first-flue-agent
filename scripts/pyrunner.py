#!/usr/bin/env python3
"""Phase-1 Python HTTP runner for the data-cleaner agent.
Endpoints:
  POST /run   {code, env?, timeoutMs?} -> {ok, stdout, stderr, exitCode, resultPath?}
  GET  /file?path=...                    -> text content
  POST /save {src, dest}                 -> {ok}
Runs python3 with pandas on the host. resultPath is read from the RESULT_PATH env
the snippet was given (so the agent's tools can reference the staged output).
"""
import json, os, subprocess, tempfile, shutil
from http.server import HTTPServer, BaseHTTPRequestHandler

PYTHON = os.environ.get("DC_PYTHON", "python3")
HOST, PORT = "127.0.0.1", int(os.environ.get("DC_PYTHON_PORT", "8790"))

def _clean_json(o):
    import math
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
        return None
    if isinstance(o, dict):
        return {k: _clean_json(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean_json(x) for x in o]
    return o

def _sanitize_stdout(stdout):
    """Re-serialize python JSON output with NaN/Infinity -> null so it is valid JSON
    for Flue's tool-output serialization (which rejects non-JSON values)."""
    t = stdout.strip()
    if not t:
        return stdout
    # the snippet may print warnings first; try parse the last JSON-looking line(s)
    try:
        import json
        obj = json.loads(t)
        return json.dumps(_clean_json(obj), ensure_ascii=False) + "\n"
    except Exception:
        # fall back: try parsing trailing JSON object
        for i in range(len(t)):
            try:
                import json
                obj = json.loads(t[i:])
                return t[:i] + json.dumps(_clean_json(obj), ensure_ascii=False) + "\n"
            except Exception:
                continue
    return stdout

class H(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def _text(self, code, text):
        b = text.encode(); self.send_response(code)
        self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass

    def do_POST(self):
        n = int(self.headers.get("content-length", 0)); body = self.rfile.read(n) if n else b""
        try:
            req = json.loads(body or b"{}")
        except Exception:
            return self._json(400, {"ok": False, "stderr": "invalid json"})
        if self.path == "/run":
            return self._handle_run(req)
        if self.path == "/save":
            try:
                os.makedirs(os.path.dirname(req["dest"]), exist_ok=True)
                shutil.copyfile(req["src"], req["dest"]); return self._json(200, {"ok": True})
            except Exception as e:
                return self._json(500, {"ok": False, "stderr": str(e)})
        return self._json(404, {"ok": False, "stderr": "not found"})

    def _handle_run(self, req):
        code = req.get("code", ""); env_in = req.get("env") or {}
        timeout = (req.get("timeoutMs") or 30000) / 1000.0
        d = tempfile.mkdtemp(prefix="dc-")
        script = os.path.join(d, "run.py")
        with open(script, "w") as f: f.write(code)
        result_path = os.path.join(d, "result.csv")
        env = dict(os.environ); env.update(env_in)
        env.setdefault("INPUT_PATH", env_in.get("INPUT_PATH", ""))
        env["RESULT_PATH"] = result_path; env["OUTPUT_PATH"] = result_path
        try:
            p = subprocess.run([PYTHON, script], cwd=d, env=env,
                                capture_output=True, text=True, timeout=timeout)
            ok = (p.returncode == 0)
            return self._json(200, {
                "ok": ok, "stdout": _sanitize_stdout(p.stdout)[-4000:], "stderr": p.stderr[-4000:],
                "exitCode": p.returncode,
                "resultPath": result_path if ok and os.path.exists(result_path) else None,
            })
        except subprocess.TimeoutExpired as e:
            return self._json(200, {"ok": False, "stdout": (e.stdout or "")[-2000:],
                                    "stderr": "timeout", "exitCode": 124, "resultPath": None})
        except Exception as e:
            return self._json(500, {"ok": False, "stderr": str(e), "exitCode": 1, "resultPath": None})

    def do_GET(self):
        if self.path.startswith("/file"):
            from urllib.parse import urlparse, parse_qs
            q = parse_qs(urlparse(self.path).query)
            path = (q.get("path") or [""])[0]
            try:
                with open(path) as f: return self._text(200, f.read())
            except Exception as e: return self._text(404, str(e))
        return self._json(404, {"ok": False, "stderr": "not found"})

if __name__ == "__main__":
    print(f"pyrunner on http://{HOST}:{PORT} (python={PYTHON})", flush=True)
    HTTPServer((HOST, PORT), H).serve_forever()
