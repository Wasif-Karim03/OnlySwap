#!/usr/bin/env python3
"""Local server for scripts/dev/sim-audit.sh (one per simulator).

The app's dev-only /dev/audit screen asks GET /next for a route, opens it,
waits, then calls GET /shot; this server answers with the routes in order and
takes the simulator screenshot on /shot. It runs every route once per text
size, switching the simulator's text size between passes, then answers
{"end": true} and exits.

usage: sim-audit-server.py PORT UDID OUTDIR ROUTES_FILE SETTLE_MS
"""
import json
import os
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT, UDID, OUTDIR, ROUTES_FILE, SETTLE = sys.argv[1:6]
NAME = os.path.basename(OUTDIR)
SIZES = ["large", "extra-extra-large", "accessibility-large"]  # default, +2, accessibility
ROUTES = open(ROUTES_FILE).read().split()
state = {"pass": 0, "i": -1, "done": False, "shots": 0}


def set_size(size):
    subprocess.run(["xcrun", "simctl", "ui", UDID, "content_size", size], check=False)
    time.sleep(2)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet; progress is printed below
        pass

    def reply(self, body):
        data = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/next"):
            state["i"] += 1
            if state["i"] >= len(ROUTES):
                state["pass"] += 1
                state["i"] = 0
                if state["pass"] >= len(SIZES):
                    state["done"] = True
                    return self.reply({"end": True})
                set_size(SIZES[state["pass"]])
            return self.reply({"route": "/" + ROUTES[state["i"]], "settle": int(SETTLE)})
        if self.path.startswith("/shot"):
            size = SIZES[state["pass"]]
            route = ROUTES[state["i"]]
            folder = os.path.join(OUTDIR, size)
            os.makedirs(folder, exist_ok=True)
            path = os.path.join(folder, route.replace("/", "_") + ".png")
            subprocess.run(
                ["xcrun", "simctl", "io", UDID, "screenshot", "--type=png", path],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
            )
            state["shots"] += 1
            print(f"  {NAME} {size} {route}", flush=True)
            return self.reply({"ok": True})
        self.send_response(404)
        self.end_headers()


set_size(SIZES[0])
server = HTTPServer(("127.0.0.1", int(PORT)), Handler)
while not state["done"]:
    server.handle_request()
subprocess.run(["xcrun", "simctl", "ui", UDID, "content_size", "large"], check=False)
print(f"{NAME}: {state['shots']} screenshots in {OUTDIR}", flush=True)
