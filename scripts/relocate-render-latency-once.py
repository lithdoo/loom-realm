#!/usr/bin/env python3
"""One-time migration of the last root Markdown specification with reference fencing."""
from __future__ import annotations
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
OLD = Path('RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md')
NEW = Path('doc/30-implementation/render-movement-latency-spec.md')
NAME = OLD.name
LINK = re.compile(r'(?P<open>!?\[[^\]\n]*\]\()(?P<target><[^>]+>|[^\s)]+)(?P<close>(?:\s+"[^"\n]*")?\))')
OLD_GH = f'https://github.com/lithdoo/loom-realm/blob/main/{NAME}'
NEW_GH = f'https://github.com/lithdoo/loom-realm/blob/main/{NEW.as_posix()}'


def rel(target: Path, destination: Path) -> str:
    path = os.path.relpath(target.as_posix(), start=destination.parent.as_posix() or '.')
    return path if path.startswith('.') else './' + path


def rewrite(text: str, src: Path, dest: Path) -> str:
    text = text.replace(OLD_GH, NEW_GH)
    def link(m: re.Match[str]) -> str:
        target = m.group('target')
        angled = target.startswith('<') and target.endswith('>')
        raw = target[1:-1] if angled else target
        u = urlsplit(raw)
        if u.scheme or u.netloc or not u.path or u.path.startswith('/'):
            return m.group(0)
        resolved = Path(os.path.normpath(os.path.join(src.parent.as_posix(), u.path)))
        if resolved == OLD:
            path = rel(NEW, dest)
        elif src == OLD:
            assert (ROOT / resolved).exists(), f'missing source link in moved spec: {raw}'
            path = rel(resolved, dest)
        else:
            return m.group(0)
        rewritten = urlunsplit(u._replace(path=path))
        if angled:
            rewritten = '<' + rewritten + '>'
        return m.group('open') + rewritten + m.group('close')
    text = LINK.sub(link, text)
    if NAME in text:
        text = text.replace(NAME, rel(NEW, dest))
    return text


def main() -> None:
    assert subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT).decode().strip() == 'docs/remove-root-milestone-reports'
    assert (ROOT / OLD).is_file() and not (ROOT / NEW).exists()
    tracked = [Path(x.decode()) for x in subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).split(b'\0') if x]
    non_markdown = []
    for p in tracked:
        if p.suffix == '.md' or p.as_posix() in ('scripts/relocate-render-latency-once.py', '.github/workflows/render-latency-migration-once.yml'):
            continue
        try:
            if NAME in (ROOT / p).read_text(encoding='utf-8'):
                non_markdown.append(p.as_posix())
        except (OSError, UnicodeDecodeError):
            continue
    assert not non_markdown, f'non-Markdown references require manual intervention: {non_markdown}'
    edited = 0
    for p in [x for x in tracked if x.suffix == '.md']:
        raw = (ROOT / p).read_text(encoding='utf-8')
        target = NEW if p == OLD else p
        updated = rewrite(raw, p, target)
        # Only sanitize rewritten lines: historical Markdown hard breaks in
        # untouched lines are preserved instead of mass reformatted.
        if updated != raw or target != p:
            if p == OLD:
                updated = '> 当前冻结实施规格及历史测量；**正式性能资格仍待验证**。当前待办以[统一路线图](./roadmap.md)为准，不把历史 42.9ms/96.3ms 冒充新版本指标。\n\n' + updated
            lines = updated.splitlines(keepends=True)
            updated = ''.join(x.rstrip(' \t\r\n') + '\n' if '](' in x else x for x in lines)
            full = ROOT / target
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_text(updated, encoding='utf-8')
            if p != target:
                (ROOT / p).unlink()
            edited += 1
    assert not (ROOT / OLD).exists() and (ROOT / NEW).exists()
    names = [p.name for p in ROOT.iterdir() if p.is_file() and p.suffix == '.md']
    assert names == ['README.md'], f'root Markdown remains: {names}'
    print(f'FINAL ROOT MARKDOWN: {names}; migrated spec: {NEW}; touched Markdown: {edited}')

if __name__ == '__main__':
    main()
