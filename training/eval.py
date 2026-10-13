"""
Accuracy and speed of the model served by Ollama on the held-out lines, next to the rules alone.

    .venv/Scripts/python eval.py [model=nexus-matcher]

test-seen: catalogue models seen in training, written differently. test-unseen: models kept out of
training, as for catalogue entries added later. The model is only asked about the lines the rules
did not settle, so the main figures are on those ("uncertain").
"""

import json
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).parent
MODEL = sys.argv[1] if len(sys.argv) > 1 else "nexus-matcher"
URL = "http://127.0.0.1:11434/api/chat"


def ask(messages):
    """The model's answer (a candidate number) and the call's duration, with the backend's settings."""
    body = json.dumps({
        "model": MODEL, "stream": False, "keep_alive": "30m", "messages": messages,
        "options": {"temperature": 0, "num_predict": 4},
    }).encode()
    start = time.perf_counter()
    req = urllib.request.Request(URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as res:
        content = json.loads(res.read())["message"]["content"]
    digits = "".join(c for c in content.strip().split()[0] if c.isdigit()) if content.strip() else ""
    return (int(digits) if digits else -1), time.perf_counter() - start


def pct(n, d):
    return f"{100 * n / d:5.1f} %" if d else "    -"


ask([{"role": "system", "content": "warm-up"}, {"role": "user", "content": "1"}])  # load the model first

for split in ["test-seen", "test-unseen"]:
    rows = [json.loads(line) for line in open(HERE / "data" / f"{split}.jsonl", encoding="utf-8") if line.strip()]
    start = time.perf_counter()
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda r: ask(r["messages"][:2]), rows))
    wall = time.perf_counter() - start
    times = sorted(t for _, t in results)

    def report(label, subset):
        right = [r for r, (a, _) in subset if a == int(r["messages"][2]["content"])]
        named = [(r, a) for r, (a, _) in subset if int(r["messages"][2]["content"]) > 0]
        none = [(r, a) for r, (a, _) in subset if int(r["messages"][2]["content"]) == 0]
        wrong_pick = sum(1 for r, a in named if a not in (0, int(r["messages"][2]["content"]))) + sum(1 for r, a in none if a != 0)
        # The rules on the same lines (model kept in the catalogue only: the rules saw all of it).
        fair = [r for r, _ in subset if not r["meta"].get("dropped")]
        rules_ok = sum(1 for r in fair if (r["meta"].get("rules") == r["meta"].get("ref") if r["meta"]["rulesStatus"] != "unmatched" else not r["meta"].get("ref")))
        print(f"  {label:<28} {len(subset):>5} lines · model right {pct(len(right), len(subset))}"
              f" · wrong model picked {pct(wrong_pick, len(subset))}"
              f" · model missed (said 0) {pct(sum(1 for _, a in named if a == 0), len(subset))}"
              f" · rules alone right {pct(rules_ok, len(fair))}")

    pairs = list(zip(rows, results))
    print(f"{split}: {len(rows)} lines in {wall:.1f} s ({len(rows) / wall:.0f} lines/s, 4 in parallel), "
          f"per call p50 {1000 * statistics.median(times):.0f} ms, p95 {1000 * times[int(0.95 * len(times))]:.0f} ms")
    report("all", pairs)
    report("uncertain (sent to the model)", [p for p in pairs if p[0]["meta"]["rulesStatus"] != "matched"])
    report("devices in the catalogue", [p for p in pairs if p[0]["meta"]["kind"] == "device" and not p[0]["meta"].get("dropped")])
    report("model not in catalogue", [p for p in pairs if p[0]["meta"].get("dropped")])
    report("not a device / tablet / watch", [p for p in pairs if p[0]["meta"]["kind"] != "device"])
