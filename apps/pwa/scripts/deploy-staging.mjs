import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const composeFile = join(appRoot, "deploy", "compose.yaml");
const releaseRootName = "releases";
const stateName = join("deploy-state", "active.env");

export function activeId(text) {
  const match = /^PWA_RELEASE_ID=([0-9a-f]{7,64})$/m.exec(text ?? "");
  return match === null ? null : match[1];
}

export function activeFile(id) {
  if (!/^[0-9a-f]{7,64}$/.test(id)) throw new Error("Invalid release id");
  return `PWA_RELEASE_ID=${id}\n`;
}

export async function readActiveId(root) {
  try {
    return activeId(await readFile(join(root, stateName), "utf8"));
  } catch (cause) {
    if (cause?.code === "ENOENT") return null;
    throw cause;
  }
}

export async function writeActiveId(root, id) {
  const file = join(root, stateName);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, activeFile(id), { encoding: "utf8", flag: "wx" });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: "inherit", shell: false });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function portPublished(port) {
  const output = await new Promise((resolve, reject) => {
    const child = spawn("docker", ["ps", "--format", "{{.Ports}}"], { shell: false });
    let text = "";
    child.stdout.on("data", (chunk) => { text += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(text) : reject(new Error("docker ps failed")));
  });
  return output.split(/\r?\n/).some((line) => line.includes(`:${port}->`));
}

/**
 * Probe HTTP from within the actual Web container. Docker Desktop ports
 * published only on Windows 127.0.0.1 need not be reachable from the Runner
 * through host.docker.internal; the old host-origin probe could fail even
 * when the Web container was healthy.
 *
 * A separate Windows-host check must still validate 127.0.0.1:8787 after
 * deployment; this check deliberately does not claim external reachability.
 */
async function containerSmoke(project, releaseDir, port) {
  const origin = "http://127.0.0.1";
  for (const path of [
    "/pwa/pokeman/",
    "/pwa/pokeman/window.js",
    "/pwa/pokeman/service-worker.js",
    "/pwa/pokeman/pokeman-bundle.json",
  ]) {
    await compose(project, releaseDir, port, ["exec", "-T", "web", "wget", "-q", "-O", "/dev/null", `${origin}${path}`]);
  }
  const rootWorker = await run("docker", [
    "compose", "-p", project, "-f", composeFile,
    "exec", "-T", "web", "wget", "-q", "-O", "/dev/null",
    `${origin}/service-worker.js`,
  ], { PWA_RELEASE_DIR: releaseDir, PWA_HTTP_PORT: String(port) });
  if (rootWorker === 0) throw new Error("Service Worker is exposed at the site root");
}

async function compose(project, releaseDir, port, action) {
  const args = ["compose", "-p", project, "-f", composeFile, ...action];
  const code = await run("docker", args, {
    PWA_RELEASE_DIR: releaseDir,
    PWA_HTTP_PORT: String(port),
  });
  if (code !== 0) throw new Error(`docker compose ${action.join(" ")} failed`);
}

export async function deployRelease(options) {
  const previous = await readActiveId(options.dataRoot);
  await mkdir(join(options.dataRoot, releaseRootName, options.sha), { recursive: true });
  await cp(options.sourceDir, join(options.dataRoot, releaseRootName, options.sha), { recursive: true });
  // nginx.conf must remain available for the lifetime of the Web container.
  // Binding ./nginx.conf from an ephemeral Actions checkout is not durable.
  await cp(join(appRoot, "deploy", "nginx.conf"), join(options.dataRoot, releaseRootName, options.sha, "nginx.conf"));
  const releaseDir = options.releaseDir(options.sha);
  try {
    if (await options.portPublished(options.candidatePort)) throw new Error(`Candidate port ${options.candidatePort} is in use`);
    await options.compose(options.candidateProject, releaseDir, options.candidatePort, ["up", "-d", "--force-recreate", "--wait"]);
    await options.smoke(options.candidateUrl, options.candidateProject, releaseDir, options.candidatePort);
  } catch (cause) {
    await options.compose(options.candidateProject, releaseDir, options.candidatePort, ["down"]).catch(() => {});
    return Object.freeze({ status: "candidate-failed", active: previous, error: cause });
  }
  await options.compose(options.candidateProject, releaseDir, options.candidatePort, ["down"]);
  try {
    await options.compose(options.officialProject, releaseDir, options.officialPort, ["up", "-d", "--force-recreate", "--wait"]);
    if (!(await options.portPublished(options.officialPort))) {
      throw new Error(`Official HTTP port ${options.officialPort} is not published by a running container`);
    }
    console.log(`Official HTTP port ${options.officialPort} is published by Docker`);
    await options.smoke(options.officialUrl, options.officialProject, releaseDir, options.officialPort);
    // Commit the new active identity only after the official endpoint passes.
    await writeActiveId(options.dataRoot, options.sha);
  } catch (cause) {
    if (previous === null) {
      await options.compose(options.officialProject, releaseDir, options.officialPort, ["down"]).catch(() => {});
      await rm(join(options.dataRoot, stateName), { force: true });
    } else {
      await writeActiveId(options.dataRoot, previous);
      await options.compose(options.officialProject, options.releaseDir(previous), options.officialPort, ["up", "-d", "--force-recreate", "--wait"]);
      await options.smoke(options.officialUrl, options.officialProject, options.releaseDir(previous), options.officialPort);
    }
    return Object.freeze({ status: "rolled-back", active: previous, error: cause });
  }
  return Object.freeze({ status: "published", active: options.sha });
}

async function main() {
  const sha = process.env.GITHUB_SHA ?? "";
  const dataRoot = process.env.PWA_DATA_ROOT ?? "";
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("GITHUB_SHA must be a full commit id");
  if (dataRoot.length === 0) throw new Error("PWA_DATA_ROOT is required");
  const candidatePort = Number(process.env.PWA_CANDIDATE_PORT ?? "8790");
  const officialPort = Number(process.env.PWA_HTTP_PORT ?? "8787");
  const engineRoot = process.env.PWA_ENGINE_DATA_ROOT ?? dataRoot;
  const result = await deployRelease({
    sha,
    dataRoot,
    sourceDir: join(appRoot, "dist", "staging"),
    candidatePort,
    officialPort,
    candidateProject: "loomrealm-pwa-candidate",
    officialProject: "loomrealm-pwa",
    candidateUrl: "/pwa/pokeman",
    officialUrl: "/pwa/pokeman",
    releaseDir: (id) => join(engineRoot, "releases", id).replaceAll("\\", "/"),
    portPublished,
    compose,
    smoke: (_url, project, releaseDir, port) => containerSmoke(project, releaseDir, port),
  });
  if (result.status !== "published") {
    console.error(result.status);
    process.exitCode = 1;
  } else {
    console.log(`published ${result.active}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
