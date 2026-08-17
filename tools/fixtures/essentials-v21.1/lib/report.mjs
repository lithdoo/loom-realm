import { resolve } from "node:path";
import { ImportFailure } from "./errors.mjs";

function formatBytes(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function createConsoleReporter(consoleImpl = console) {
  return {
    start(options, outputParent) {
      consoleImpl.log("Source:");
      consoleImpl.log(options.source === undefined ? "  auto-download: Eevee Expo Essentials v21.1" : `  local: ${resolve(options.source)}`);
      consoleImpl.log(`Output parent: ${outputParent}`);
    },
    reserved(logicalName) {
      consoleImpl.log(`Output root:   ${logicalName}`);
    },
    success(plan, mode, output) {
      consoleImpl.log("\nImported Pokémon Essentials v21.1\n");
      consoleImpl.log(`Acquisition:\n  ${mode}\n`);
      consoleImpl.log("Tables:");
      for (const table of plan.tables) {
        const item = plan.stats.get(table);
        consoleImpl.log(`  ${table.padEnd(10)} ${String(item.count).padStart(5)} resources  ${formatBytes(item.bytes)} bytes`);
      }
      const count = [...plan.stats.values()].reduce((sum, item) => sum + item.count, 0);
      const bytes = [...plan.stats.values()].reduce((sum, item) => sum + item.bytes, 0n);
      consoleImpl.log(`\nTotal:\n  ${count} files\n  ${formatBytes(bytes)} bytes`);
      consoleImpl.log(`\nWarnings:\n  ${plan.warnings.length}`);
      for (const warning of plan.warnings) consoleImpl.log(`  ${warning}`);
      const physical = plan.coverage.physical;
      const registry = plan.coverage.registry;
      consoleImpl.log(`\nPhysical coverage:\n  ${physical.classifiedObjects}/${physical.totalObjects} classified\n  ${physical.unclassifiedRecognisedObjects} unclassified`);
      for (const [classification, amount] of Object.entries(physical.classifications)) {
        consoleImpl.log(`  ${classification}: ${amount}`);
      }
      consoleImpl.log(`\nVanillaRegistry coverage:\n  authority: ${registry.authority.repository}@${registry.authority.commit}\n  expected PBS families: ${registry.expectedFamilies.length}\n  classified PBS families: ${registry.classifiedFamilies.length}\n  semantic PBS families: ${registry.implementedFamilies.length}\n  remaining semantic PBS families: ${registry.remainingFamilies.length}`);
      consoleImpl.log(`  compiled-data roots: ${plan.coverage.compiledData.length}`);
      consoleImpl.log(`  hardcoded domains: ${plan.coverage.hardcoded.expectedDomains.length}`);
      consoleImpl.log(`  compiler passes: ${plan.coverage.compiler.expectedPasses.length}`);
      consoleImpl.log(`  RMXP roots/patterns: ${plan.coverage.rmxp.roots.length}`);
      consoleImpl.log(`  parsed PBS properties discarded: ${plan.coverage.pbs.discardedProperties}`);
      consoleImpl.log(`  parsed PBS unknown properties: ${plan.coverage.pbs.unknownProperties}`);
      consoleImpl.log(`  Marshal roots decoded: ${plan.coverage.marshal.decodedRoots.length}`);
      consoleImpl.log(`  Marshal nodes discarded: ${plan.coverage.marshal.discardedNodes}`);
      consoleImpl.log(`  RMXP classes encountered: ${Object.keys(plan.coverage.rmxp.encounteredClasses).length}`);
      consoleImpl.log(`  RMXP generic classes: ${Object.keys(plan.coverage.rmxp.genericUnknownClasses).length}`);
      consoleImpl.log(`  RMXP ivars discarded: ${plan.coverage.rmxp.discardedIvars}`);
      consoleImpl.log(`  compiler passes classified: ${plan.coverage.semantic.compilerPasses.length}`);
      consoleImpl.log(`  opaque Ruby scripts: ${plan.coverage.semantic.opaqueRubyScripts}`);
      consoleImpl.log(`  unclassified event commands: ${plan.coverage.semantic.unclassifiedEventMeaning}`);
      consoleImpl.log(`  structured tables: ${plan.structured.tables.length}`);
      consoleImpl.log(`  structured objects: ${plan.structured.objects.length}`);
      consoleImpl.log(`  known references: ${plan.coverage.integrity.knownReferences}`);
      consoleImpl.log(`  Oracle fields compared: ${plan.coverage.oracle.comparedFields}`);
      consoleImpl.log(`  Oracle unclassified differences: ${plan.coverage.oracle.unclassified.length}`);
      consoleImpl.log(`  compiled-data domains materialized: ${plan.coverage.compiledDataMaterialization.materializedDomains.length}`);
      consoleImpl.log(`\nFSDB validation: PASS\nOutput: ${output}`);
    },
  };
}

export function printFailure(error, consoleImpl = console) {
  const category = error instanceof ImportFailure ? error.category : "COPY_FAILURE";
  consoleImpl.error(`\n${category}: ${error.message}`);
  if (error instanceof ImportFailure) {
    for (const detail of error.details) consoleImpl.error(`  ${detail}`);
  }
}
