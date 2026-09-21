#!/usr/bin/env python3
"""Check references to retired process documents in every tracked Markdown file.

The VitePress link checker only scans doc/. This additionally guards retirement
of example/package notes without claiming that all repository Markdown has been
fully rewritten. GitHub historical permalinks are valid and are not blocked.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
RETIRED_RELATIVE = (
    "game-libs/map/LEDGE_BRIDGE_PASSABILITY_ANALYSIS.md",
    "game-libs/map/TERRAIN_BEHAVIOR_AGENT_TASK_CARDS.md",
    "game-libs/map/TERRAIN_BEHAVIOR_DESIGN_DRAFT.md",
    "game-libs/map/TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md",
    "game-libs/map/TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md",
    "game-libs/map/TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md",
    "examples/essentials-v21.1-local/MAP_BEHAVIOR_REQUIREMENTS.md",
    "packages/data/IMPLEMENTATION-REVIEW.md",
    "packages/subsystem/IMPLEMENTATION-REVIEW.md",
)
RETIRED = frozenset((ROOT / path).resolve() for path in RETIRED_RELATIVE)
LINK = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def main() -> int:
    tracked = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.md"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    sources = [ROOT / entry.decode("utf-8") for entry in tracked.stdout.split(b"\0") if entry]
    errors = []
    checked = 0
    for source in sources:
        if not source.is_file():
            continue
        fence = None
        for line_number, line in enumerate(source.read_text(encoding="utf-8").splitlines(), 1):
            stripped = line.lstrip()
            if stripped.startswith(("```", "~~~")):
                marker = stripped[:3]
                if fence is None:
                    fence = marker
                elif fence == marker:
                    fence = None
                continue
            if fence is not None:
                continue
            for match in LINK.finditer(line):
                target = match.group(1).strip().strip("<>")
                parsed = urlsplit(target)
                if not parsed.path or parsed.scheme or parsed.netloc or target.startswith("#"):
                    continue
                candidate = unquote(parsed.path)
                resolved = ROOT / candidate.lstrip("/") if candidate.startswith("/") else source.parent / candidate
                checked += 1
                if resolved.resolve() in RETIRED:
                    errors.append(f"{source.relative_to(ROOT)}:{line_number}: {target}")
    if errors:
        print("Links to retired process documents remain:", file=sys.stderr)
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Retired document links OK: {checked} relative links across {len(sources)} tracked Markdown paths.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
