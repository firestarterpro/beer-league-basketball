#!/usr/bin/env python3
from __future__ import annotations
import json
import os
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# --- CONFIG ---
SYNC_DIR = Path(r"C:\Templar Archives\Basketball Bro\beer-league\sync")
PYTHON   = SYNC_DIR / ".venv" / "Scripts" / "python.exe"
RUNNER   = SYNC_DIR / "sync_runner.py"
HTML_FILE      = SYNC_DIR / "Beer League Control Panel.html"
SCHEDULES_FILE = SYNC_DIR / "console_schedules.json"

HOST = "127.0.0.1"
PORT = 8080

JOBS = {
    "status":   ["status"],
    "moves":    ["run", "moves"],
    "stats":    ["run", "stats"],
    "postgame": ["run", "postgame"],
    "nightly":  ["run", "nightly"],
}
TIMEOUTS = {"interval": 30, "default": 300}
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
_sched_lock = threading.Lock()

# --- HEARTBEAT LOGIC (Auto-Shutdown) ---
last_ping_time = time.time()

def heartbeat_watchdog():
    global last_ping_time
    while True:
        time.sleep(1)
        # If we haven't received a ping from the browser in 5 seconds, kill the server
        if time.time() - last_ping_time > 5.0:
            os._exit(0)

# Start the watchdog in the background immediately
threading.Thread(target=heartbeat_watchdog, daemon=True).start()

# --- SERVER LOGIC ---
def load_schedules() -> dict:
    if SCHEDULES_FILE.exists():
        try: return json.loads(SCHEDULES_FILE.read_text(encoding="utf-8"))
        except Exception: return {}
    return {}

def save_schedule(job_id: str, data: dict) -> dict:
    with _sched_lock:
        all_sched = load_schedules()
        all_sched[job_id] = data
        SCHEDULES_FILE.write_text(json.dumps(all_sched, indent=2), encoding="utf-8")
        return all_sched

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"
    def log_message(self, fmt, *args): pass

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path: Path, ctype="text/html; charset=utf-8"):
        if not path.exists():
            self.send_json({"error": f"missing file: {path}"}, 404)
            return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n: return {}
        try: return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception: return {}

    def do_GET(self):
        global last_ping_time
        path = self.path.split("?")[0]
        
        if path in ("/", "/index.html"): 
            self.send_file(HTML_FILE)
        elif path == "/api/ping":
            last_ping_time = time.time() # Reset the timer!
            self.send_json({"ok": True})
        elif path == "/api/schedules": 
            self.send_json(load_schedules())
        else: 
            self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        parts = self.path.split("?")[0].strip("/").split("/")
        if len(parts) == 3 and parts[1] == "run": 
            self.handle_run(parts[2])
        elif len(parts) == 3 and parts[1] == "schedules":
            save_schedule(parts[2], self.read_json_body())
            self.send_json({"ok": True})
        else: 
            self.send_json({"error": "not found"}, 404)

    def handle_run(self, job_id: str):
        payload = self.read_json_body()
        if job_id == "interval":
            try: minutes = int(payload.get("minutes") or 15)
            except ValueError: minutes = 15
            args = ["moves-every", str(max(1, min(10080, minutes)))]
            save_schedule("interval", {"mode": "interval", "value": minutes})
        elif job_id in JOBS: args = JOBS[job_id]
        else:
            self.send_json({"error": "unknown job"}, 404)
            return
        self.stream_subprocess(job_id, args)

    def stream_subprocess(self, job_id: str, args: list):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.end_headers()

        def emit(obj: dict):
            self.wfile.write((json.dumps(obj) + "\n").encode("utf-8"))
            self.wfile.flush()

        emit({"type": "start"})
        if not PYTHON.exists() or not RUNNER.exists():
            emit({"type": "error", "text": "Missing python or runner file"})
            emit({"type": "done", "code": 127})
            return

        try:
            proc = subprocess.Popen(
                [str(PYTHON), str(RUNNER)] + args, cwd=str(SYNC_DIR),
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, bufsize=1, creationflags=CREATE_NO_WINDOW,
            )
        except Exception as exc:
            emit({"type": "error", "text": f"spawn failed: {exc}"})
            emit({"type": "done", "code": 1})
            return

        timeout = TIMEOUTS.get(job_id, TIMEOUTS["default"])
        def watchdog():
            try: proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                emit({"type": "error", "text": "timed out"})
                proc.kill()
        threading.Thread(target=watchdog, daemon=True).start()

        try:
            assert proc.stdout is not None
            for line in iter(proc.stdout.readline, ''):
                emit({"type": "line", "text": line.rstrip("\r\n")})
            code = proc.wait()
            emit({"type": "done", "code": code})
        except (BrokenPipeError, ConnectionResetError):
            try: proc.kill()
            except Exception: pass
        finally:
            if proc.stdout: proc.stdout.close()

def main():
    if not SYNC_DIR.exists(): sys.exit("sync dir not found")
    
    # Auto-open the browser
    threading.Timer(1.0, lambda: webbrowser.open(f"http://{HOST}:{PORT}")).start()
    
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try: server.serve_forever()
    except KeyboardInterrupt: server.shutdown()

if __name__ == "__main__":
    main()