# Sandbox verification policy

`.github/workflows/sandbox-smoke.yml` is manual (`workflow_dispatch`) only and targets the fixed `https://ccv2.sandbox.commercekit.tools` service. No repository secrets are required. Exact confirmation: `RUN-COMMERCEKIT-SANDBOX-BUILD`. Concurrency serializes runs without cancellation; the job has a ten-minute ceiling.

**All five live scenarios passed on 2026-11-09 with explicit owner approval.** The guarded prepare, bundled Action, assertion, and cleanup sequence ran locally because GitHub rejected dispatch before this new workflow existed on main. See [validation evidence](build-validation.md). Future live runs still require owner approval; ordinary CI performs no Sandbox mutation or OAuth request.

Each invocation creates one disposable run, masks returned synthetic control/OAuth credentials, publishes step-local cleanup outputs before configuring the scenario, and invokes the local bundled Action. The documented synthetic subscription is `131762872233634f29fdeb7d50983aa4`; application `commerce` is a Sandbox fixture only. Production runtime contains neither default.

| Choice         | Configuration                                           | Expected result                               |
| -------------- | ------------------------------------------------------- | --------------------------------------------- |
| success        | SUCCESS, one nonterminal poll                           | SUCCESS / success                             |
| failure        | FAIL, safe synthetic failure message                    | FAIL / failure                                |
| nonterminating | NEVER                                                   | BUILDING / internal-error, BUILD_WAIT_TIMEOUT |
| rate-limit     | getBuildProgress fault 429 on first call, Retry-After 1 | Eventual SUCCESS; retryCount positive         |
| create-error   | createBuild fault 500 on first call                     | Internal error, no replay, zero builds        |

The required deployment block in the Sandbox scenario is configuration boilerplate only; no deployment operation is called. All smoke scenarios use a ten-second poll interval and one-minute Action timeout.

Assertions validate NotificationEvent v1 through the exact shared package validator, result fields, separate Action outputs, step outcome, secret absence, returned build code, timing/counts, and isolated state. For create-error, the documented state counter `createBuild:` must be one and build count zero. Assertion failures do not print full events or state. Cleanup always attempts DELETE of the disposable run with its control token; failures are reported without token details. No artifacts are uploaded. Hard termination may prevent cleanup; the service's run expiry remains a fallback.

Dependency installation uses GitHub Packages with read-only workflow permissions and an installation-step-only GITHUB_TOKEN. Scenario configuration, fixed origin, confirmation, and always-run cleanup are unchanged. The shared-package migration does not run live Sandbox scenarios.
