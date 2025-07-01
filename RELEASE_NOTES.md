This release updates workspace management and CI deployment for projects using pnpm with an opinionated structure. The changes restore explicit workspace scoping and local package link overrides, improving multi-package development while streamlining documentation deployment.

**Improvements**

* Restored exclusions for the `docs` directory and local dependency overrides in `pnpm-workspace.yaml` to clarify project boundaries and enable local development workflows for core packages.
* Simplified the `deploy-docs.yml` workflow by removing temporary renaming of the workspace file; documentation builds and deployments now work directly with the refined workspace configuration.

**Why these changes matter:**

* Empower clearer separation between core packages and documentation in the monorepo setup.
* Align local development processes and CI deployment behavior.
* Reduce special-casing and ad-hoc workarounds in documentation workflows.

_No breaking changes or new features are introduced for end users._