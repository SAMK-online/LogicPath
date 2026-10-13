"""Run the browser harness on one problem in a fresh process (so a hopeless brute-force solution can be killed)."""
import json
import sys
from pathlib import Path

HARNESS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "workers" / "harness.py"
ns: dict = {}
exec(compile(HARNESS.read_text(), str(HARNESS), "exec"), ns)
payload = json.loads(sys.stdin.read())
print(ns["run_payload"](json.dumps(payload)))
