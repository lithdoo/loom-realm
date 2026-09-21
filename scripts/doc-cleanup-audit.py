#!/usr/bin/env python3
"""One-time read-only inventory for finished process-document removal."""
from pathlib import Path
import subprocess

root = Path.cwd()
paths = [Path(name) for name in subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0') if name]
root_milestones = sorted(p for p in paths if p.parent == Path('.') and p.suffix == '.md' and p.name.startswith('M') and '_' in p.name and p.name[1].isdigit())
process = sorted(p for p in paths if p.parent == Path('doc/30-implementation') and p.suffix == '.md' and any(word in p.stem for word in ('review', 'report', 'plan', 'closure')))
candidates = root_milestones + process
text_files = {}
for p in paths:
    if p.suffix in ('.md', '.ts', '.js', '.mjs', '.mts', '.json', '.jsonc', '.yaml', '.yml', '.py', '.sh', '.bat', '.toml', '.txt'):
        try:
            text_files[p] = p.read_text(encoding='utf-8')
        except (UnicodeError, OSError):
            pass
print(f'DOC AUDIT: {len(root_milestones)} root milestone docs; {len(process)} process docs; {len(text_files)} tracked text files')
for candidate in candidates:
    matches = [p.as_posix() for p, text in text_files.items() if p != candidate and candidate.name in text]
    label = 'ROOT' if candidate in root_milestones else 'DOC'
    print(f'{label} {candidate.as_posix()} refs={len(matches)} ' + ','.join(matches[:8]))
