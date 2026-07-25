#!/usr/bin/env python3
"""Validate relative links in Markdown files under doc/.

The checker intentionally has no third-party dependencies so it can run in
local development and GitHub Actions with the system Python interpreter.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DOC_ROOT = REPOSITORY_ROOT / "doc"
MARKDOWN_LINK = re.compile(r"!?(?:\[[^\]]*\])\(([^)]+)\)")
EXTERNAL_SCHEMES = {
    "http",
    "https",
    "mailto",
    "tel",
    "data",
    "javascript",
}


@dataclass(frozen=True)
class BrokenLink:
    source: Path
    line: int
    target: str
    resolved: Path


def iter_markdown_links(path: Path):
    """Yield (line_number, target) outside fenced code blocks."""

    in_fence = False
    fence_marker = ""

    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        stripped = line.lstrip()

        if stripped.startswith("```") or stripped.startswith("~~~"):
            marker = stripped[:3]
            if not in_fence:
                in_fence = True
                fence_marker = marker
            elif marker == fence_marker:
                in_fence = False
                fence_marker = ""
            continue

        if in_fence:
            continue

        for match in MARKDOWN_LINK.finditer(line):
            target = match.group(1).strip()
            if target.startswith("<") and target.endswith(">"):
                target = target[1:-1].strip()
            yield line_number, target


def resolve_relative_link(source: Path, target: str) -> Path | None:
    """Resolve a Markdown target to a repository path, or None if external."""

    if not target or target.startswith("#"):
        return None

    parsed = urlsplit(target)
    if parsed.scheme.lower() in EXTERNAL_SCHEMES or parsed.netloc:
        return None

    decoded_path = unquote(parsed.path)
    if not decoded_path:
        return None

    if decoded_path.startswith("/"):
        resolved = REPOSITORY_ROOT / decoded_path.lstrip("/")
    else:
        resolved = source.parent / decoded_path

    return resolved.resolve()


def is_inside_repository(path: Path) -> bool:
    try:
        path.relative_to(REPOSITORY_ROOT)
    except ValueError:
        return False
    return True


def main() -> int:
    if not DOC_ROOT.is_dir():
        print(f"documentation directory not found: {DOC_ROOT}", file=sys.stderr)
        return 2

    broken: list[BrokenLink] = []
    checked_links = 0
    markdown_files = sorted(DOC_ROOT.rglob("*.md"))

    for source in markdown_files:
        for line_number, target in iter_markdown_links(source):
            resolved = resolve_relative_link(source, target)
            if resolved is None:
                continue

            checked_links += 1
            if not is_inside_repository(resolved) or not resolved.exists():
                broken.append(
                    BrokenLink(
                        source=source,
                        line=line_number,
                        target=target,
                        resolved=resolved,
                    )
                )

    if broken:
        print("Broken documentation links:", file=sys.stderr)
        for item in broken:
            source = item.source.relative_to(REPOSITORY_ROOT)
            try:
                resolved = item.resolved.relative_to(REPOSITORY_ROOT)
            except ValueError:
                resolved = item.resolved
            print(
                f"- {source}:{item.line}: {item.target!r} -> {resolved}",
                file=sys.stderr,
            )
        print(
            f"\n{len(broken)} broken link(s) across "
            f"{len(markdown_files)} Markdown file(s).",
            file=sys.stderr,
        )
        return 1

    print(
        f"Documentation links OK: {checked_links} relative link(s) "
        f"across {len(markdown_files)} Markdown file(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
