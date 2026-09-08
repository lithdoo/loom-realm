import { BOOTSTRAP_ENV_KEY, parseRunnerBootstrap, runBootstrap } from "./bootstrap.js";
import { createRunnerDataProvisioning } from "./data-provisioning.js";
import { CONTENT_ACCESS_ENV_KEY, parseHostraContentAccess } from "../content-access.js";

const encoded = process.env[BOOTSTRAP_ENV_KEY];
const encodedContentAccess = process.env[CONTENT_ACCESS_ENV_KEY];
delete process.env[BOOTSTRAP_ENV_KEY];
delete process.env[CONTENT_ACCESS_ENV_KEY];

try {
  const dataProvisioning = createRunnerDataProvisioning();
  const bootstrap = parseRunnerBootstrap(encoded as string);
  const contentAccess = encodedContentAccess === undefined ? undefined : parseHostraContentAccess(encodedContentAccess);
  await runBootstrap(bootstrap, dataProvisioning, contentAccess);
} catch {
  // Parent authority consumes physical exit/control-loss facts. Do not print
  // bootstrap credentials, endpoints, module paths, or untrusted causes.
  process.exitCode = 1;
}
