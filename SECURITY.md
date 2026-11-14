# Security

Report vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/commercekit-tools/ccv2-build/security/advisories/new). If reporting is unavailable, ask a repository owner to enable it without disclosing sensitive details in a public issue. Do not include credentials in reports.

Technical-user token endpoint, client ID, client secret, and resource are secrets. The Action masks them before validation and masks access tokens immediately on receipt. Tokens stay in process memory and are never cached on disk or emitted in outputs. JavaScript garbage collection does not guarantee immediate memory erasure; use isolated trusted runners.

Both endpoints require HTTPS. Redirects are blocked for token and Management calls, even between same-origin URLs. Token endpoint and Management origin need not match. Workflow authors control both trusted destinations; do not pass attacker-controlled URLs or secrets to untrusted workflows. Management calls use `x-approuter-authorization`; only the token request receives client credentials.

The Action has no telemetry, callback, provider delivery, or webhook logic. Its runtime network access is limited to the configured endpoints. Action runtime code invokes no shell or subprocess. The bundled Actions toolkit includes transitive utilities; this Action does not call their execution helpers.

Raw responses, request headers, build logs, stacks, and causes never become outputs. Responses and JSON outputs are bounded, summaries HTML-escape dynamic text, and known secret values plus common bearer/JWT patterns are redacted. Public scan detects common local paths and credential formats; human review is still necessary for arbitrary customer identifiers and secrets unknown to the Action.

Create-build mutation retries after ambiguous failures are forbidden to avoid duplicate builds. One explicit 401 refresh replay is allowed. Read/token retries are bounded and abortable. Timeout or workflow cancellation does not delete or cancel a remote build. Hard runner termination may prevent failure outputs.

Only synthetic fixtures belong in this public repository. Never add real SAP credentials to repository secrets or run tests against a real SAP subscription. The guarded manual Sandbox workflow creates synthetic credentials and deletes its disposable run in an always-run step. Run creation failures or hard runner termination can prevent cleanup; Sandbox runs expire independently.

Exact direct dependencies, pinned external Actions, CodeQL, Dependabot, bundle reproducibility, and offline contract validation are part of the quality gate. The minimatch override in pnpm-workspace.yaml mitigates GHSA-g3hv-75wg-m249 in development tooling; remove it only after upstream dependencies select a patched compatible version.

Shared authentication/transport and notification code comes from the exact published `@commercekit-tools/ccv2-client@0.0.3` and `@commercekit-tools/notification-contract@0.0.3` packages. They are included in the reviewed bundle; runtime does not access GitHub Packages. Registry authentication is for maintainer/CI installation only, with read-only package permissions and no committed credentials. Package upgrades must retain mutation retry safety, secret masking/redaction, bounded outputs, and the compatibility fixtures. Build retains its disclosure order and HTML summary escaping; shared primitives implement markup filtering and linear JWT-like token redaction.
