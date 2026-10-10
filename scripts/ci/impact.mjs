import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ALL = {
  code: true,
  content: true,
  presentation: true,
  map: true,
  schema: true,
  pwa: true,
  battle: true,
  desktop: true,
  windows: true,
  docs: true,
};

const FALSE = Object.fromEntries(Object.keys(ALL).map((key) => [key, false]));

const setAllCode = (impact) => {
  for (const key of ["code", "content", "presentation", "map", "schema", "pwa", "battle", "desktop", "windows"]) {
    impact[key] = true;
  }
};

const sourcePath = (path) =>
  /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|lock|css|html)$/i.test(path) ||
  path.endsWith(".npmrc");

export function classifyPaths(paths) {
  if (paths.length === 0) return { ...ALL };

  const impact = { ...FALSE };
  for (const path of paths) {
    if (
      path === "package.json" ||
      path === "package-lock.json" ||
      path === ".npmrc" ||
      path.startsWith(".github/workflows/") ||
      path.startsWith(".github/actions/") ||
      path.startsWith("scripts/ci/") ||
      path === "test/ci-architecture.test.mjs"
    ) {
      setAllCode(impact);
      impact.docs = true;
      continue;
    }

    if (path.startsWith("doc/")) {
      impact.docs = true;
      if (path.startsWith("doc/15-contracts/")) setAllCode(impact);
      continue;
    }

    if (path.endsWith(".md")) {
      impact.docs = true;
      if (path.startsWith("game-libs/map/") && /CONTRACT|TERRAIN_BEHAVIOR/i.test(path)) {
        impact.code = true;
        impact.map = true;
        impact.presentation = true;
        impact.pwa = true;
      }
      continue;
    }

    if (path.startsWith("packages/foundation/") || path.startsWith("packages/wire/")) {
      setAllCode(impact);
      continue;
    }

    if (
      path.startsWith("packages/realm-state/") ||
      path.startsWith("packages/game-package/")
    ) {
      impact.code = true;
      impact.presentation = true;
      impact.map = true;
      impact.pwa = true;
      impact.desktop = true;
      impact.windows = true;
      continue;
    }

    if (
      path.startsWith("packages/platform-ports/") ||
      path.startsWith("packages/runtime-control/") ||
      path.startsWith("packages/renderer-control/") ||
      path.startsWith("packages/data/") ||
      path.startsWith("packages/subsystem/") ||
      path.startsWith("packages/renderer/") ||
      path.startsWith("packages/main/")
    ) {
      impact.code = true;
      impact.presentation = true;
      impact.map = true;
      impact.schema = true;
      impact.pwa = true;
      impact.desktop = true;
      if (path.startsWith("packages/subsystem/") || path.startsWith("packages/main/")) {
        impact.windows = true;
      }
      continue;
    }

    if (path.startsWith("packages/fsdb/") || path.startsWith("packages/fsdb-http/")) {
      impact.code = true;
      impact.content = true;
      impact.map = true;
      continue;
    }

    if (path.startsWith("packages/game-launcher-hostra/")) {
      impact.code = true;
      impact.desktop = true;
      impact.windows = true;
      continue;
    }

    if (path.startsWith("packages/game-launcher-pwa/")) {
      impact.code = true;
      impact.pwa = true;
      continue;
    }

    if (path.startsWith("apps/desktop/")) {
      impact.code = true;
      impact.desktop = true;
      impact.windows = true;
      continue;
    }

    if (path.startsWith("apps/pwa/")) {
      impact.code = true;
      impact.pwa = true;
      continue;
    }

    if (
      path.startsWith("game-libs/map/") ||
      path.startsWith("game-libs/tile-presentation/") ||
      path.startsWith("examples/essentials-v21.1/") ||
      path.startsWith("examples/essentials-v21.1-local/") ||
      path.startsWith("tools/fixtures/essentials-v21.1/")
    ) {
      impact.code = true;
      impact.content = true;
      impact.presentation = true;
      impact.map = true;
      impact.pwa = true;
      continue;
    }

    if (path.startsWith("game-libs/schema-form/") || path.startsWith("test/schema-form-v1/")) {
      impact.code = true;
      impact.presentation = true;
      impact.schema = true;
      continue;
    }

    if (path.startsWith("game-libs/battle/")) {
      impact.code = true;
      impact.battle = true;
      continue;
    }

    if (path.startsWith("test/user-input-v1/") || path.startsWith("test/render-update-v1/")) {
      impact.code = true;
      continue;
    }

    if (path.startsWith("test/rpgmap-") || path === "test/map-layering-browser.test.mjs") {
      impact.code = true;
      impact.map = true;
      impact.presentation = true;
      continue;
    }

    if (path.startsWith("test/") || path.startsWith("scripts/") || sourcePath(path)) {
      setAllCode(impact);
      continue;
    }

    // Unknown non-document paths fail closed.
    setAllCode(impact);
  }

  return impact;
}

function changedPaths(base, head) {
  const output = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
    encoding: "utf8",
  });
  return output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function emit(impact, paths) {
  const browser = impact.presentation || impact.map || impact.schema || impact.pwa;
  const result = { ...impact, browser, paths };
  if (process.env.GITHUB_OUTPUT) {
    for (const [key, value] of Object.entries({ ...impact, browser })) {
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--all")) {
    emit({ ...ALL }, ["<manual-full-impact>"]);
  } else {
    const [base, head] = process.argv.slice(2);
    if (!base || !head) throw new Error("usage: impact.mjs <base> <head> | --all");
    const paths = changedPaths(base, head);
    emit(classifyPaths(paths), paths);
  }
}
