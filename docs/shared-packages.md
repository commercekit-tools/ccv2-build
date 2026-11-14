# Shared-package migration

This source-de-duplication uses exactly `@commercekit-tools/notification-contract@0.0.3` and `@commercekit-tools/ccv2-client@0.0.3`. The baseline is `ebdc830161cf9122121ddeb137d005f375063997`. Action metadata, lifecycle decisions, and public inputs/outputs are unchanged. No Notify, Deploy, Sandbox, or legacy repository is modified.

## Responsibility inventory

| Existing module or responsibility                                     | Classification                    | Result                                                                                                                                                                         |
| --------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vendored schema, provenance, copied license, update script, Ajv setup | REPLACE WITH NOTIFICATION PACKAGE | Removed; use public schema export and validator                                                                                                                                |
| `src/notification.ts` event envelope, types, context, workflow URL    | MIXED — SPLIT                     | Shared `createBuildEvent`/context extraction; local outcome/result mapping and known-secret exclusions; shared factory selects approved data/error fields and the Build source |
| `src/security.ts` bounded text/error and exact-secret redaction       | MIXED — SPLIT                     | Shared sanitizers and transport redaction; retain Build's masking registry, filter ordering, and summary HTML escaping                                                         |
| `src/auth.ts` token exchange, cache, proactive refresh                | REPLACE WITH CCV2 PACKAGE         | Removed; `TechnicalUserTokenManager` owns token lifecycle                                                                                                                      |
| `src/http.ts` timeout, response reading, retries, Retry-After         | REPLACE WITH CCV2 PACKAGE         | Removed; shared client owns transport; monotonic Action runtime injection retained in `src/runtime.ts`                                                                         |
| `src/inputs.ts` URL parsing                                           | MIXED — SPLIT                     | Shared URL validators; local input constraints and stable INVALID_INPUT translation                                                                                            |
| `src/api.ts` authorization and replay                                 | MIXED — SPLIT                     | Shared client; retain Build paths, JSON bodies, expected statuses, DTO validation, and error mapping                                                                           |
| `src/transport.ts`                                                    | BUILD-SPECIFIC — KEEP             | Thin package adapter for existing poll/retry counters, masking, abort signal, clock boundary, and error codes; no retry loop or token implementation                           |
| `src/action.ts`, `src/result.ts`, `src/errors.ts`, `action.yml`       | BUILD-SPECIFIC — KEEP             | Polling state machine, deadline, terminal mappings, result shape, output order, summary and logging                                                                            |
| Sandbox preparation/assertions/cleanup and Action tests               | BUILD-SPECIFIC — KEEP             | Same guarded scenarios; assertions use the shared bounded JSON parser/validator; install steps gain scoped registry auth                                                       |

## Request policies and compatibility

- Token exchange is delegated to `TechnicalUserTokenManager`, with three total transient attempts, memory-only caching, a 60-second maximum proactive window, and refresh-on-401 when expiry is absent.
- `createBuild`: explicit `unsafe-mutation`, `refreshOn401: true`. Timeout, network failure, 429 and 5xx never automatically replay the POST. Only an explicit 401 can invalidate credentials and replay once.
- `getBuildProgress`: explicit `safe-read`, `refreshOn401: true`. Three transient attempts with shared Retry-After/backoff and one explicit authorization replay.
- Every request receives the Action abort signal; request timeout remains 30 seconds and response bound remains 256 KiB. Overall deadline and timeout semantics stay local. The adapter supplies an epoch-based clock derived from monotonic elapsed time so HTTP-date Retry-After remains correct without changing duration measurement.
- Shared response kinds remain untrusted endpoint data. Build requires the expected HTTP status and a JSON object; arrays, empty and binary bodies are rejected. Only shared bounded problem facts are eligible for Build error messages; raw bodies and package exceptions never enter outputs.
- `retryCount` retains existing retry/authorization-refresh accounting and is separate from actual progress HTTP attempt count. Failure during token refresh retains authentication error classification.
- Shared event creation preserves `ccv2.build.completed`, component `ccv2-build`, absence of a source version, outcome mappings, optional fields, and workflow links. Output emission still precedes `core.setFailed`.

Sixteen fixtures captured before refactoring check complete results/events and summaries, with only generated event ID/time normalized and JSON compared structurally. Regression tests cover mutation request count, 401 replay, transient reads, response kinds, disclosure, and unchanged metadata. Package-internal HTTP primitive tests were replaced by Build integration assertions.

## Distribution and review

Both exact dependencies and required transitive dependencies are bundled by ncc. A test copies the bundle outside the repository, supplies only synthetic HTTP responses, removes registry token values, and executes it without repository node_modules. Workflow consumers require no package installation or registry permission. `bundle:check` compares regenerated files byte-for-byte; ncc license notices and the public scan cover the committed bundle.

Only maintainer/CI installation uses GitHub Packages authentication. The source-controlled `.npmrc` contains a scope mapping, never credentials. See [contributing](../CONTRIBUTING.md) for local setup and package upgrade review. The Action remains **UNRELEASED**; this migration runs no live Sandbox or SAP requests and creates no tags or release.

## Remaining local adapters

The duplication audit also replaces credential/runtime type declarations with `TechnicalUserCredentials` and `RuntimeDependencies`, and completion/error types with `CompletedStatus` and `SafeNotificationError`. The Build result model still owns its fields and stricter required error code. Event creation delegates schema field selection and default source metadata to the shared factory; compatibility tests verify omitted Build-only fields and optional source version behavior.

The remaining local helpers have no equivalent public API in the pinned packages:

- Poll/retry counting and transport-error translation preserve the existing Action outputs and stable error codes. They do not implement token storage, HTTP reads, retry loops, or 401 replay.
- Exact-secret registration connects package masking to `core.setSecret`. The ordering of shared markup/JWT filters and local HTML summary escaping preserves Build's existing disclosure and rendering policy; generic redaction, bounds, and error text use package primitives.
- GitHub context filtering excludes known secrets and control characters before shared extraction. The shared extractor owns the field allowlist and run URL construction; the Action supplies its existing workflow-link label.
- Sandbox control requests use the separate control API's `Authorization` bearer model. The CCv2 Management client always sends `x-approuter-authorization`, so it is not a compatible replacement for these test-harness requests. No live Sandbox request is needed for this audit.

## Shared primitives in 0.0.3

CCv2 path-segment validation/encoding now delegates to `encodeCcv2PathSegment`. The Action keeps input diagnostics and translates `INVALID_PATH_ENCODING` to its existing malformed-Unicode failure classification. Markup filtering and JWT-shaped token redaction delegate to `stripAngleBracketText` and `redactJwtLikeTokens` at their original positions in the sanitization pipeline. The new JWT scanner removes the copied regex's quadratic behavior on repeated prefixes. No provider rendering, masking registration, HTML summary escaping, endpoint validation or lifecycle logic moves into the package.

The frozen integration corpus compares 25 text cases and 29 identifier cases with the pre-extraction Action. It includes the long-markup/truncation behavior that differs between Build and Deploy. Action metadata and existing notification-event fixtures remain unchanged.
