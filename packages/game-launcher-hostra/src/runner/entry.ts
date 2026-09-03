import { BOOTSTRAP_ENV_KEY, parseRunnerBootstrap, runBootstrap } from "./bootstrap.js";

const encoded = process.env[BOOTSTRAP_ENV_KEY];
delete process.env[BOOTSTRAP_ENV_KEY];

try {
  const bootstrap = parseRunnerBootstrap(encoded as string);
  await runBootstrap(bootstrap);
} catch {
  // Parent authority consumes physical exit/control-loss facts. Do not print
  // bootstrap credentials, endpoints, module paths, or untrusted causes.
  process.exitCode = 1;
}
