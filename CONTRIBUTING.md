# Contributing

Use Node **24.21.0**, pnpm **12.6.0**, and Corepack:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm format
pnpm lint
pnpm typecheck
pnpm contracts:check
pnpm test
pnpm test:coverage
pnpm audit
pnpm bundle
pnpm bundle:check
pnpm scan:public
pnpm quality
```

Commit TypeScript source, focused tests, lockfile changes, and rebuilt `dist/` together in PRs. The root package is private; do not publish to npm. Direct dependencies must use exact versions. Coverage must meet 95% for statements, branches, functions, and lines. Cross-platform CI runs orchestration tests and executes the bundled Action with a mocked fetch implementation.

Use visibly synthetic fixtures only. No real SAP credentials, tenant endpoints, customer identifiers, production subscription requests, private source, local machine paths, or live API recordings belong here. IntelliJ files, node_modules, coverage, and local environment files are ignored. Never read the complete GitHub event payload into notification data.

The local vendored notify schema is checked offline. `pnpm contracts:notify:update <full-notify-commit-SHA>` is an explicit maintainer operation; review the schema/provenance diff, license, and compatibility tests. Normal build and quality commands do not fetch schemas.

Read [Sandbox policy](docs/sandbox.md) before requesting live smoke approval. Routine PR CI must never create Sandbox runs. No deployment implementation, provider delivery, shared CCv2 package, tags, or release belongs in this change. Review [RELEASING.md](RELEASING.md).
