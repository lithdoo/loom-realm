#!/usr/bin/env python3
"""Fail if tracked Markdown still links to retired Map process documents.

This complements scripts/check-doc-links.py (VitePress doc/ links), and catches
references elsewhere in the repository without treating Git history URLs as
broken or changing qualification evidence.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
RETIRED = frozenset(
    ROOT / "game-libs/map" / name
    for name in (
        "LEDGE_BRIDGE_PASSABILITY_ANALYSIS.md",
        "TERRAIN_BEHAVIOR_AGENT_TASK_CARDS.md",
        "TERRAIN_BEHAVIOR_DESIGN_DRAFT.md",
        "TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md",
        "TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md",
        "TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md",
    )
)
LINK = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def main() -> int:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", "*.md"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    sources = [ROOT / path.decode("utf-8") for path in result.stdout.split(b"\0") if path]
    broken: list[str] = []
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
                resolved = (ROOT / candidate.lstrip("/")) if candidate.startswith("/") else (source.parent / candidate)
                checked += 1
                if resolved.resolve() in RETIRED:
                    broken.append(f"{source.relative_to(ROOT)}:{line_number}: {target}")
    if broken:
        print("Links to retired Map process documents remain:", file=sys.stderr)
        print("\n".join(broken), file=sys.stderr)
        return 1
    print(f"Retired document links OK: {checked} relative links in {len(sources)} tracked Markdown paths.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
