import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activeId, deployRelease, readActiveId } from "../scripts/deploy-staging.mjs";

test("active release file stores only the commit id", () => {
  assert.equal(activeId("PWA_RELEASE_ID=0123456789abcdef\n"), "0123456789abcdef");
  assert.equal(activeId("note\n"), null);
});

test("a failed candidate leaves the active release untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "loomrealm-deploy-"));
  const source = join(root, "source");
  await mkdir(join(source, "pwa", "pokeman"), { recursive: true });
  await mkdir(join(root, "deploy-state"), { recursive: true });
  await writeFile(join(source, "pwa", "pokeman", "index.html"), "new", "utf8");
  await writeFile(join(root, "deploy-state", "active.env"), "PWA_RELEASE_ID=aaaaaaaaaaaaaaa\n");
  const calls = [];
  const result = await deployRelease({
    sha: "bbbbbbbbbbbbbbb",
    dataRoot: root,
    sourceDir: source,
    candidatePort: 8790,
    officialPort: 8787,
    candidateProject: "candidate",
    officialProject: "official",
    candidateUrl: "http://candidate/pwa/pokeman",
    officialUrl: "http://official/pwa/pokeman",
    releaseDir: (id) => `/engine/releases/${id}`,
    portPublished: async (port, project) => project === "official" && port === 8787,
    compose: async (...args) => { calls.push(args); throw new Error("candidate down"); },
    smoke: async () => { throw new Error("smoke failed"); },
  });
  assert.equal(result.status, "candidate-failed");
  assert.equal(await readActiveId(root), "aaaaaaaaaaaaaaa");
  assert.deepEqual(calls[0][3], ["up", "-d", "--force-recreate", "--wait"]);
  assert.deepEqual(calls[1][3], ["down"]);
});

test("a failed official check restores the previous release", async () => {
  const root = await mkdtemp(join(tmpdir(), "loomrealm-deploy-"));
  const source = join(root, "source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "marker.txt"), "new", "utf8");
  await mkdir(join(root, "deploy-state"), { recursive: true });
  await writeFile(join(root, "deploy-state", "active.env"), "PWA_RELEASE_ID=aaaaaaaaaaaaaaa\n");
  const calls = [];
  let smoked = 0;
  const result = await deployRelease({
    sha: "bbbbbbbbbbbbbbb",
    dataRoot: root,
    sourceDir: source,
    candidatePort: 8790,
    officialPort: 8787,
    candidateProject: "candidate",
    officialProject: "official",
    candidateUrl: "http://candidate/pwa/pokeman",
    officialUrl: "http://official/pwa/pokeman",
    releaseDir: (id) => `/engine/releases/${id}`,
    portPublished: async (port, project) => project === "official" && port === 8787,
    compose: async (project, releaseDir, port, action) => {
      calls.push({ project, releaseDir, port, action });
    },
    smoke: async (url) => {
      smoked += 1;
      // Candidate/official checks run before the new identity is published.
      assert.equal(await readActiveId(root), "aaaaaaaaaaaaaaa");
      if (url.startsWith("http://official") && smoked === 2) throw new Error("official smoke failed");
    },
  });
  assert.equal(result.status, "rolled-back");
  assert.equal(result.active, "aaaaaaaaaaaaaaa");
  assert.equal(await readActiveId(root), "aaaaaaaaaaaaaaa");
  assert.equal(calls.at(-1).project, "official");
  assert.equal(calls.at(-1).releaseDir, "/engine/releases/aaaaaaaaaaaaaaa");
  assert.equal(await readFile(join(root, "releases", "bbbbbbbbbbbbbbb", "marker.txt"), "utf8"), "new");
});

test("missing official port rolls back without publishing the new SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "loomrealm-deploy-"));
  const source = join(root, "source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "marker.txt"), "new", "utf8");
  await mkdir(join(root, "deploy-state"), { recursive: true });
  await writeFile(join(root, "deploy-state", "active.env"), "PWA_RELEASE_ID=aaaaaaaaaaaaaaa\n");
  const checks = [];
  const smokes = [];
  const result = await deployRelease({
    sha: "bbbbbbbbbbbbbbb",
    dataRoot: root,
    sourceDir: source,
    candidatePort: 8790,
    officialPort: 8787,
    candidateProject: "candidate",
    officialProject: "official",
    candidateUrl: "candidate",
    officialUrl: "official",
    releaseDir: (id) => `/engine/releases/${id}`,
    portPublished: async (port, project) => {
      checks.push([port, project ?? null]);
      return false;
    },
    compose: async () => {},
    smoke: async (...args) => { smokes.push(args); },
  });
  assert.equal(result.status, "rolled-back");
  assert.equal(await readActiveId(root), "aaaaaaaaaaaaaaa");
  assert.deepEqual(checks, [[8790, null], [8787, "official"]]);
  assert.deepEqual(smokes.map(([url, , releaseDir]) => [url, releaseDir]), [
    ["candidate", "/engine/releases/bbbbbbbbbbbbbbb"],
    ["official", "/engine/releases/aaaaaaaaaaaaaaa"],
  ]);
});

test("successful deployment commits active SHA after official health and persists Nginx configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "loomrealm-deploy-"));
  const source = join(root, "source");
  await mkdir(join(source, "pwa", "pokeman"), { recursive: true });
  await writeFile(join(source, "pwa", "pokeman", "index.html"), "ready", "utf8");
  const seen = [];
  const result = await deployRelease({
    sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    dataRoot: root,
    sourceDir: source,
    candidatePort: 8790,
    officialPort: 8787,
    candidateProject: "candidate",
    officialProject: "official",
    candidateUrl: "candidate",
    officialUrl: "official",
    releaseDir: (id) => `/engine/releases/${id}`,
    portPublished: async (port, project) => project === "official" && port === 8787,
    compose: async (project, releaseDir, port, action) => {
      seen.push(`${project}:${action[0]}`);
      if (action[0] === "up") {
        assert.match(await readFile(join(root, "releases", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "nginx.conf"), "utf8"), /location \/pwa\/pokeman\//);
      }
    },
    smoke: async (url) => {
      seen.push(`smoke:${url}`);
      assert.equal(await readActiveId(root), null, "active release must not be committed before official HTTP smoke");
    },
  });
  assert.equal(result.status, "published");
  assert.equal(await readActiveId(root), "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.deepEqual(seen, ["candidate:up", "smoke:candidate", "candidate:down", "official:up", "smoke:official"]);
});
