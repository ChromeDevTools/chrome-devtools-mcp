from __future__ import annotations

import json
import os
import subprocess
import sys


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def main() -> int:
    # Read hook JSON input (best-effort; TaskCompleted/TeammateIdle always fire).
    try:
        _ = json.loads(sys.stdin.read() or "{}")
    except Exception:
        pass

    # Only run gates if the odds pipeline package is importable in this environment.
    probe = _run([sys.executable, "-c", "import odds_pipeline"])
    if probe.returncode != 0:
        print("odds_pipeline not installed; skipping odds pipeline gates", file=sys.stderr)
        return 0

    v = _run([sys.executable, "-m", "odds_pipeline", "validate"])
    if v.returncode != 0:
        print("odds pipeline validation failed", file=sys.stderr)
        print(v.stdout, file=sys.stderr)
        print(v.stderr, file=sys.stderr)
        return 2

    # Only enforce freshness if DATABASE_URL is present (so local doc work isn't blocked).
    if os.getenv("DATABASE_URL"):
        f = _run([sys.executable, "-m", "odds_pipeline", "freshness-guard", "--window-days", "5"])
        if f.returncode != 0:
            print("freshness guard failed", file=sys.stderr)
            print(f.stdout, file=sys.stderr)
            print(f.stderr, file=sys.stderr)
            return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

