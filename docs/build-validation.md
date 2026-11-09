# Build compatibility validation

Validation date: 2026-11-09 UTC. Explicit owner approval covered live CommerceKit Sandbox scenarios and squash-merge of PR #1. The runtime tested was commit `c713930b339ab132a831569bac7c2fecf9dccd4c`; subsequent validation documentation does not change its bundle or public inputs/outputs.

## Execution and cleanup

GitHub rejected pre-merge dispatch with `workflow sandbox-smoke.yml not found on the default branch`. To preserve the requirement to test before merging, the existing guarded `prepare.mjs`, committed `dist/index.js`, `assert.mjs`, and `cleanup.mjs` ran locally in the workflow's sequence. The exact confirmation was supplied, the target remained the fixed CommerceKit Sandbox, and each scenario created one disposable run.

Temporary credential/output files had restricted permissions, child output was captured without printing credentials, and cleanup ran in a finally block regardless of Action or assertion outcome. Each successful DELETE was independently followed by GET of that run using its control token; every GET returned HTTP 404. Temporary per-run files were removed. No live credentials, run identifiers, raw responses, or producer payloads are committed.

| Scenario       | Last SAP status | Outcome        | Error code             | Progress requests | Retries | Duration ms | Deleted / GET |
| -------------- | --------------- | -------------- | ---------------------- | ----------------: | ------: | ----------: | ------------- |
| success        | SUCCESS         | success        | —                      |                 2 |       0 |       10868 | Yes / 404     |
| failure        | FAIL            | failure        | BUILD_FAILED           |                 2 |       0 |       10608 | Yes / 404     |
| nonterminating | BUILDING        | internal-error | BUILD_WAIT_TIMEOUT     |                 6 |       0 |       60011 | Yes / 404     |
| rate-limit     | SUCCESS         | success        | —                      |                 3 |       1 |       11916 | Yes / 404     |
| create-error   | unavailable     | internal-error | CREATE_BUILD_AMBIGUOUS |                 0 |       0 |         255 | Yes / 404     |

All existing result/output/schema/secret-absence/state assertions passed. Create-error verified `createBuild:` call count one and zero created builds. Timeout stopped local waiting without cancelling the remote build. Failure, timeout, and create-error returned failed Action exits while still producing valid outputs and permitting cleanup.

## Notify compatibility

Current Notify main was pinned and inspected at `23451071bcdb856f5a5c4b1f59cfe45ab9641893`. An isolated temporary checkout supplied its unchanged validator, presentation builder, Slack renderer, and Teams renderer. TypeScript was transpiled into a separate temporary directory; no Notify source was modified and no shared package was published or consumed.

Every one of the five actual producer events passed Notify's `validateEvent`, including its additional safe-link and event/status checks. Every event was passed through `createPresentation`, `renderSlack`, and `renderTeams`: ten provider payloads rendered successfully. Network fetch was disabled during validation/rendering. Payload structure and absence of the run credentials were asserted without printing full payloads.

Titles matched the outcomes: CCv2 build succeeded, CCv2 build failed, or CCv2 build encountered an internal error. This verifies offline producer compatibility, not live webhook acceptance. Live Slack and Teams delivery remain separate release gates.

## Local verification and contract review

Node 24.21.0 and pnpm 12.6.0 matched the pins. Frozen installation and the complete `pnpm quality` gate passed: formatting, lint, typecheck, offline pinned schema validation, 119 mocked tests, coverage, reproducible bundle, public scan, and audit. Coverage was 99.69% statements, 98.47% branches, 100% functions, and 99.66% lines, exceeding all 95% thresholds.

SAP 2.0.12 create/progress and technical-user authentication were rechecked against the official documentation. Code review confirmed the form-encoded client_credentials/resource request, bearer Management header, memory-only token refresh, one explicit 401 replay, no ambiguous create replay, documented terminal states, bounded outputs, timeout preservation, and provider-neutral NotificationEvent mapping. No runtime defect or public contract change was needed.

## Baseline and release

The compatibility baseline is the squash-merge commit of [PR #1](https://github.com/commercekit-tools/ccv2-build/pull/1), recorded in the PR after merge and in the completion report. PR checks must pass on its final head; main CI must be observed after merge. The Action remains UNRELEASED. There are no version tags, GitHub Release, Marketplace publication, or real SAP tests. Deployment-chain validation, live provider smoke, and coordinated release approval remain blocked gates in RELEASING.md.
