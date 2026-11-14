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

Both shared packages are pinned to `0.0.3`. `.npmrc` commits only the `@commercekit-tools` registry mapping. Before installation, configure a **user-level**, untracked npm configuration containing `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` and supply `NODE_AUTH_TOKEN` through your secure credential tooling. Use a GitHub token with `read:packages` and access to both packages. Never put the token in repository configuration or command-line arguments. pnpm 12 verifies lockfile supply-chain metadata during installation; after a lockfile change, repeat the authenticated frozen installation before running other pnpm commands.

CI and the manual Sandbox workflow grant only `contents: read` and `packages: read`, use the existing SHA-pinned setup-node Action with the scoped registry, and expose `secrets.GITHUB_TOKEN` only to installation steps. Package owners must grant this repository Actions read access to both packages. The bundled Action needs no registry credentials.

`pnpm contracts:check` verifies installed and declared package versions, imports the package's public schema export, validates the captured baseline events, rejects the old duplicate schema, and runs Action-level compatibility scenarios offline. It never fetches Notify main or a live schema. Baseline fixtures were captured from `ebdc830161cf9122121ddeb137d005f375063997`; do not regenerate them merely to accept a changed result.

Review package upgrades for authentication/refresh behavior, explicit retry policies, disclosure, event compatibility, licenses, and bundle changes. Use exact published versions, run all quality gates, and rebuild committed dist. The release-age exceptions in pnpm-workspace.yaml apply only to the two explicitly reviewed `0.0.3` versions; they do not exempt future versions.

Read [Sandbox policy](docs/sandbox.md) before requesting live smoke approval. Routine PR CI must never create Sandbox runs. No deployment implementation, provider delivery, new shared package publication, tags, or release belongs in this change. Review [RELEASING.md](RELEASING.md).
