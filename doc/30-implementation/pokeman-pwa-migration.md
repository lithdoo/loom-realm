# PokeMan PWA deployment ownership migrated to lithdoo-labs/pokeman

PokeMan is no longer built/deployed from the legacy copies in examples/PokeMan. The canonical PWA game source, Hosted qualification, provenance tracking and Docker publication workflow now live in lithdoo-labs/pokeman.

This change removes the old repository-level self-hosted Runner workflows:
- deploy-pokeman-staging.yml (legacy 8787 publisher)
- pokeman-staging-qualification.yml (legacy game qualification trigger)
- runner-diagnostics.yml (legacy repo Runner diagnostics)

The LoomRealm PWA library, builder, deployment script, Web Compose and regression tests stay in LoomRealm, and can be called by the **pinned git submodule** in the PokeMan repository.

## Cutover safeguards

Do not merge this retirement PR until PokeMan's hosted PWA build/browser qualification passes and the PokeMan replacement Workflow is merged with its deployment switch default OFF. The new org Docker Runner is registered only after the old Runner has finished its jobs.

Runner migration/runbook: lithdoo/lab-server/projects/pwa-runner/docs/labs-migration.md
New staging Workflow: lithdoo-labs/pokeman/.github/workflows/pwa-staging.yml

The existing static site on 127.0.0.1:8787 and its release history should **not** be deleted as part of this repository change. The actual Windows Runner registration, org Runner Group and release enablement require separately verified host and GitHub administrative actions.
