#!/usr/bin/env python3
"""One-shot, strict migration of the 46 M7–M15 root milestone documents.

Run only from the repository root on the dedicated cleanup branch. This tool is
removed once the reviewed migration commit has been produced. No ABI or test
source is changed. Historical completed M7–M13 texts remain at immutable Git
history; M14/M15 pending qualification inputs move into doc/, and the current
Hostra composition SSOT moves into its module.
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
BASE = "2d465b8c8501566b26375dae55e1a78007606c40"
REPO = "https://github.com/lithdoo/loom-realm"
HISTORY = f"{REPO}/blob/{BASE}/"
HOSTRA = "M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md"
HOSTRA_NEW = Path("doc/20-modules/desktop-host/hostra-composition.md")
PENDING = Path("doc/30-implementation/milestone-evidence")
PATTERN = re.compile(r"^M(7|8|9|10|11|12|13|14|15)_\d\d_[A-Z0-9_]+\.md$")
LINK = re.compile(r"(?P<open>!?\[[^\]\n]*\]\()(?P<target><[^>]+>|[^\s)]+)(?P<close>(?:\s+\"[^\"\n]*\")?\))")
ROOT_HISTORY_URL = re.compile(r"https://github\.com/lithdoo/loom-realm/blob/(?:main|docs/[^/]+)/(M(?:7|8|9|10|11|12|13|14|15)_\d\d_[A-Z0-9_]+\.md|M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN\.md)")


def tracked() -> list[Path]:
    result = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    return [Path(v.decode("utf-8")) for v in result.split(b"\0") if v]


def main() -> None:
    assert subprocess.check_output(["git", "branch", "--show-current"], cwd=ROOT).decode().strip() == "docs/remove-root-milestone-reports", "wrong branch"
    originals = sorted(p for p in ROOT.iterdir() if p.is_file() and (PATTERN.fullmatch(p.name) or p.name == HOSTRA))
    assert len(originals) == 46, f"expected 46 top-level milestone files, found {len(originals)}"
    groups = {f"M{i}": sum(p.name.startswith(f"M{i}_") for p in originals) for i in range(7, 16)}
    assert all(n == 5 for n in groups.values()), f"unexpected milestone cohort: {groups}"
    old_to_new: dict[str, Path | None] = {}
    for p in originals:
        if p.name == HOSTRA:
            old_to_new[p.name] = HOSTRA_NEW
        elif p.name.startswith(("M14_", "M15_")):
            old_to_new[p.name] = PENDING / p.name
        else:
            old_to_new[p.name] = None

    filenames = set(old_to_new)
    # A literal root-document reference in non-Markdown production input must
    # be audited rather than blindly transformed.
    unsafe = []
    for p in tracked():
        if p.suffix == ".md" or p.as_posix() == "scripts/relocate-root-milestones.py":
            continue
        try:
            s = (ROOT / p).read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        hit = [name for name in filenames if name in s]
        if hit:
            unsafe.append((str(p), hit))
    assert not unsafe, f"non-Markdown references require manual migration: {unsafe}"

    def destination(name: str, reader: Path) -> str:
        new = old_to_new[name]
        if new is None:
            return HISTORY + name
        rel = os.path.relpath(new.as_posix(), start=reader.parent.as_posix() or ".")
        return rel if rel.startswith(".") else "./" + rel

    def rewrite(src: str, original_path: Path, final_path: Path) -> str:
        # Exact absolute GitHub links pointing to removed root files also need
        # rewriting. Historical links are pinned, not silently redirected to
        # another mutable version of a specification.
        def absolute(m: re.Match[str]) -> str:
            name = m.group(1)
            new = old_to_new.get(name)
            return HISTORY + name if new is None else f"{REPO}/blob/main/{new.as_posix()}"

        src = ROOT_HISTORY_URL.sub(absolute, src)

        def markdown_link(m: re.Match[str]) -> str:
            target = m.group("target")
            angle = target.startswith("<") and target.endswith(">")
            raw = target[1:-1] if angle else target
            url = urlsplit(raw)
            if url.scheme or url.netloc or not url.path or url.path.startswith("/"):
                return m.group(0)
            original_target = Path(os.path.normpath(os.path.join(original_path.parent.as_posix(), url.path)))
            name = original_target.as_posix()
            if name in old_to_new:
                result = destination(name, final_path)
            elif final_path != original_path:
                if not (ROOT / original_target).exists():
                    # Original target is allowed to be absent only if it is a
                    # named historical document deleted in this same change.
                    raise ValueError(f"original link target missing: {original_path}: {raw}")
                rel = os.path.relpath(original_target.as_posix(), start=final_path.parent.as_posix() or ".")
                result = rel if rel.startswith(".") else "./" + rel
            else:
                return m.group(0)
            url = url._replace(path=result)
            rendered = urlunsplit(url)
            if angle:
                rendered = "<" + rendered + ">"
            return m.group("open") + rendered + m.group("close")

        return LINK.sub(markdown_link, src)

    original_markdown = {p: (ROOT / p).read_text(encoding="utf-8") for p in tracked() if p.suffix == ".md"}
    changed = 0
    for p, raw in original_markdown.items():
        final = old_to_new.get(p.name, p) if p.parent == Path(".") else p
        if final is None:
            # Completed process reports live only in the immutable Git history.
            (ROOT / p).unlink()
            continue
        new_text = rewrite(raw, p, final)
        if final != p:
            banner = "> 历史里程碑工作底稿；当前实现、正式契约和准确资格状态分别以模块目录、契约及资格 ledger 为准。本文原始路径已从仓库根目录移除。\n\n"
            if final == HOSTRA_NEW:
                banner = "> 当前 Hostra Desktop 物理组合细节；以当前代码、正式契约与 M15 资格 ledger 核对，不将计划中的验证误写为通过。\n\n"
            final_full = ROOT / final
            final_full.parent.mkdir(parents=True, exist_ok=True)
            final_full.write_text(banner + new_text, encoding="utf-8")
            (ROOT / p).unlink()
            changed += 1
        elif new_text != raw:
            (ROOT / p).write_text(new_text, encoding="utf-8")
            changed += 1

    landing = ROOT / PENDING / "README.md"
    landing.write_text(
        "# M14 / M15 资格底稿\n\n"
        "这里集中存放原根目录中尚涉及当前资格核查的 M14、M15 阶段底稿；它们不是另一份当前路线图或正式契约。"
        "[已实现模块](../../20-modules/core/README.md)说明当前代码，"
        "[唯一待办路线图](../roadmap.md)说明未完成交付，"
        "[M14 ledger](../m14-qualification.md)与[M15 ledger](../m15-qualification.md)保存精确证据。\n\n"
        + "\n".join(f"- [{p.name}](./{p.name})" for p in sorted(PENDING.glob("M*.md"), key=lambda p: p.name))
        + "\n",
        encoding="utf-8",
    )
    hostra_module = ROOT / "doc/20-modules/desktop-host/README.md"
    hostra_text = hostra_module.read_text(encoding="utf-8")
    if "[Hostra 物理组合细节](./hostra-composition.md)" not in hostra_text:
        hostra_module.write_text(hostra_text.rstrip() + "\n\n实现细节：[Hostra 物理组合细节](./hostra-composition.md)。\n", encoding="utf-8")

    config = ROOT / "doc/.vitepress/config.mts"
    config_src = config.read_text(encoding="utf-8")
    assert "(?:examples|packages|\\.github)" in config_src, "unexpected VitePress repo link configuration"
    config.write_text(config_src.replace("(?:examples|packages|\\.github)", "(?:examples|packages|apps|game-libs|tools|scripts|\\.github)"), encoding="utf-8")

    still = [p.name for p in ROOT.iterdir() if p.is_file() and (PATTERN.fullmatch(p.name) or p.name == HOSTRA)]
    assert not still, f"root cleanup incomplete: {still}"
    assert sum(v is None for v in old_to_new.values()) == 35
    assert sum(v is not None for v in old_to_new.values()) == 11
    print(f"ROOT MILESTONES: {len(originals)} → 0; historical Git-only: 35; moved to live evidence: 10; Hostra SSOT: 1; edited Markdown: {changed}")


if __name__ == "__main__":
    main()
