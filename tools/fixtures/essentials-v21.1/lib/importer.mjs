export async function importEssentialsV21_1(options, dependencies) {
  const outputParent = await dependencies.prepareOutputParent(options.output);
  dependencies.reporter.start(options, outputParent);

  let acquired;
  let transaction;
  try {
    acquired = await dependencies.acquireSource(options.source);
    await dependencies.validateSourceIdentity(acquired.root);
    const manifest = await dependencies.buildSourceManifest(acquired.root);
    const canonicalDataset = await dependencies.buildCanonicalDataset(manifest);
    const rawPlan = await dependencies.planRawResources(manifest);
    const coverage = dependencies.buildCoverageReport(manifest, dependencies.vanillaRegistry, { canonicalDataset });
    const plan = await dependencies.buildFsdbPlan(rawPlan, canonicalDataset, coverage);
    transaction = await dependencies.reserveOutput(outputParent);
    dependencies.reporter.reserved(transaction.logicalName);
    await dependencies.materializeRawFixture(transaction.stagingPath, plan, acquired.mode);
    await dependencies.validateWithProductionFsdb(transaction.stagingPath);
    await dependencies.promoteOutput(transaction, outputParent);
    dependencies.reporter.success(plan, acquired.mode, transaction.finalPath);
    return transaction.finalPath;
  } catch (error) {
    await dependencies.cleanupOutput(transaction, outputParent);
    throw error;
  } finally {
    if (acquired) await acquired.close();
  }
}
