#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSource } from "./lib/acquisition/source.mjs";
import { validateArchivePath } from "./lib/acquisition/zip.mjs";
import { parseArguments } from "./lib/cli.mjs";
import { ImportFailure } from "./lib/errors.mjs";
import { VANILLA_REGISTRY_V21_1 } from "./lib/essentials/v21.1/vanilla-registry.mjs";
import { buildCanonicalDataset } from "./lib/essentials/v21.1/simple-game-data.mjs";
import { planRawResources } from "./lib/fsdb/raw-resources.mjs";
import { cleanupOutput, prepareOutputParent, promoteOutput, reserveOutput } from "./lib/fsdb/transaction.mjs";
import { validateWithProductionFsdb } from "./lib/fsdb/validate.mjs";
import { materializeRawFixture } from "./lib/fsdb/writer.mjs";
import { buildFsdbPlan } from "./lib/fsdb/plan.mjs";
import { importEssentialsV21_1 } from "./lib/importer.mjs";
import { buildCoverageReport } from "./lib/model/coverage.mjs";
import { createConsoleReporter, printFailure } from "./lib/report.mjs";
import { validateSourceIdentity } from "./lib/source/identity.mjs";
import { buildSourceManifest } from "./lib/source/manifest.mjs";

export { ImportFailure, parseArguments, validateArchivePath };

export async function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const dependencies = {
    acquireSource,
    buildCoverageReport,
    buildCanonicalDataset,
    buildFsdbPlan,
    buildSourceManifest,
    cleanupOutput,
    materializeRawFixture,
    planRawResources,
    prepareOutputParent,
    promoteOutput,
    reporter: createConsoleReporter(),
    reserveOutput,
    validateSourceIdentity,
    validateWithProductionFsdb,
    vanillaRegistry: VANILLA_REGISTRY_V21_1,
  };
  return await importEssentialsV21_1(options, dependencies);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    printFailure(error);
    process.exitCode = 1;
  });
}
