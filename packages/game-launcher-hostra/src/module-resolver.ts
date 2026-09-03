import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launcherError } from "./errors.js";

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

async function canonicalRegularFile(
  candidate: string,
  missingCode: "SUBSYSTEM_MODULE_NOT_FOUND" | "LAUNCH_RUNTIME_UNAVAILABLE",
): Promise<string> {
  let canonical: string;
  try {
    canonical = await realpath(candidate);
    const facts = await stat(canonical);
    if (!facts.isFile()) throw launcherError(missingCode);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === missingCode) {
      throw error;
    }
    void error;
    throw launcherError(missingCode);
  }
  return canonical;
}

export async function canonicalizeInstallationRoot(root: string): Promise<string> {
  if (typeof root !== "string" || root.length === 0) {
    throw launcherError("PLATFORM_LAUNCH_MANIFEST_INVALID");
  }
  try {
    const canonical = await realpath(root);
    if (!(await stat(canonical)).isDirectory()) {
      throw launcherError("PLATFORM_LAUNCH_MANIFEST_INVALID");
    }
    return canonical;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "PLATFORM_LAUNCH_MANIFEST_INVALID") {
      throw error;
    }
    void error;
    throw launcherError("PLATFORM_LAUNCH_MANIFEST_INVALID");
  }
}

export async function resolveInstallationModule(
  canonicalRoot: string,
  logicalModule: string,
): Promise<string> {
  const lexical = path.resolve(canonicalRoot, ...logicalModule.split("/"));
  if (!isContained(canonicalRoot, lexical)) {
    throw launcherError("SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION");
  }
  const canonical = await canonicalRegularFile(lexical, "SUBSYSTEM_MODULE_NOT_FOUND");
  if (!isContained(canonicalRoot, canonical)) {
    throw launcherError("SUBSYSTEM_MODULE_OUTSIDE_INSTALLATION");
  }
  return canonical;
}

export async function preflightNodeExecutable(): Promise<string> {
  const major = Number.parseInt(process.versions.node.split(".", 1)[0] ?? "", 10);
  if (!Number.isInteger(major) || major < 20) {
    throw launcherError("PLATFORM_RUNTIME_UNSUPPORTED");
  }
  let canonical: string;
  try {
    canonical = await realpath(process.execPath);
    if (!(await stat(canonical)).isFile()) throw new Error("Node executable is not a file");
    if (process.platform !== "win32") await access(canonical, constants.X_OK);
  } catch (error) {
    void error;
    throw launcherError("PLATFORM_RUNTIME_UNSUPPORTED");
  }
  return canonical;
}

export async function preflightRunnerEntry(): Promise<string> {
  const candidate = fileURLToPath(new URL("./runner/entry.js", import.meta.url));
  return canonicalRegularFile(candidate, "LAUNCH_RUNTIME_UNAVAILABLE");
}
