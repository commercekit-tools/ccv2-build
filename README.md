# CommerceKit CCv2 Build

**Status: Initial implementation under development.**

No Action release or Marketplace listing is available yet. Both this Action and CommerceKit Notifications remain unreleased. The examples below describe future usage after coordinated release approval.

Trigger one SAP Commerce Cloud CCv2 build, monitor its lifecycle, and emit a provider-neutral CommerceKit NotificationEvent v1. This JavaScript Action runs on Node 24 on Linux, Windows, and macOS. It contains no deployment, webhook, Slack, or Teams delivery functionality.

## Technical-user setup

Create a technical user in Cloud Portal, grant the permissions required to trigger and view builds, and create a client secret. Collect the token endpoint, client ID, client secret, and resource supplied by Cloud Portal. Follow [SAP's current API authentication documentation](https://help.sap.com/docs/SAP_COMMERCE_CLOUD_PUBLIC_CLOUD/0fa6bcf4736c46f78c248512391eb467/66abfe678b55457fab235ce8039dda71.html?locale=en-US) and [technical-user permission and secret management](https://help.sap.com/docs/SAP_COMMERCE_CLOUD_PUBLIC_CLOUD/0c2050f6d31f49ddb6eba18509060ae5/10cd9053cab8423fbeccda3253a15e8d.html). Use least privilege appropriate to your subscription; this repository does not prescribe unverified role names.

Store these values as GitHub secrets:

- `CCV2_TOKEN_ENDPOINT`
- `CCV2_CLIENT_ID`
- `CCV2_CLIENT_SECRET`
- `CCV2_RESOURCE`

`CCV2_SUBSCRIPTION_CODE` and optional `CCV2_APPLICATION_CODE` can be GitHub variables or secrets according to your organization policy. Resource is an OAuth resource value, not a scope. Legacy API tokens are not supported.

## After v1 is published

Neither `@v1` reference below currently exists for use. For reviewed prerelease evaluation, use an explicitly reviewed commit SHA.

```yaml
- name: Trigger CCv2 build
  id: build
  uses: commercekit-tools/ccv2-build@v1 # after publication only
  with:
    token-endpoint: ${{ secrets.CCV2_TOKEN_ENDPOINT }}
    client-id: ${{ secrets.CCV2_CLIENT_ID }}
    client-secret: ${{ secrets.CCV2_CLIENT_SECRET }}
    resource: ${{ secrets.CCV2_RESOURCE }}
    subscription-code: ${{ vars.CCV2_SUBSCRIPTION_CODE }}
    application-code: ${{ vars.CCV2_APPLICATION_CODE }}
    branch: ${{ github.ref_name }}
    build-name: commerce-${{ github.run_number }}

- name: Notify Slack
  if: ${{ always() && steps.build.outputs.notification-event != '' }}
  uses: commercekit-tools/notify@v1 # after publication only
  with:
    provider: slack
    event-json: ${{ steps.build.outputs.notification-event }}
    webhook-url: ${{ secrets.COMMERCEKIT_SLACK_WEBHOOK_URL }}
```

The build step fails when the remote build does not succeed, or when the Action cannot determine success. Use `continue-on-error: true` on the build step when later processing must proceed; inspect `steps.build.outcome` and `steps.build.outputs.notification-event`. There is no input that suppresses failure.

## Inputs

All textual inputs reject control characters and are bounded. Branch and build name are JSON data with no shell interpretation. Sensitive inputs are masked before validation.

| Input                   | Required | Default                                   | Sensitive | Validation and purpose                                                           |
| ----------------------- | -------- | ----------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| `token-endpoint`        | yes      | —                                         | yes       | HTTPS, max 2048, no credentials/query/fragment; technical-user token endpoint    |
| `client-id`             | yes      | —                                         | yes       | Nonblank, max 2048; OAuth client ID                                              |
| `client-secret`         | yes      | —                                         | yes       | Nonblank, max 8192; OAuth client secret                                          |
| `resource`              | yes      | —                                         | yes       | Nonblank, max 2048; sent only to token endpoint                                  |
| `subscription-code`     | yes      | —                                         | no        | 1–128, no path separators/query/fragment/dot traversal; encoded API path segment |
| `branch`                | yes      | —                                         | no        | 1–300; application branch or tag, sent exactly                                   |
| `build-name`            | yes      | —                                         | no        | 1–200; explicit Cloud Portal name                                                |
| `application-code`      | no       | omitted                                   | no        | Max 128; blank omits the JSON property                                           |
| `api-base-url`          | no       | `https://portalapi.commerce.ondemand.com` | no        | HTTPS, max 2048, no credentials/query/fragment; normalized trailing slash        |
| `poll-interval-seconds` | no       | `60`                                      | no        | Integer 10–600; delay between progress polls                                     |
| `timeout-minutes`       | no       | `120`                                     | no        | Integer 1–1440; overall Action wait budget                                       |

Token and Management endpoints may have different origins. Tokens go only to the validated Management base URL. HTTPS Sandbox overrides are supported; plain HTTP is rejected.

## Outputs

All seven outputs are strings and are written before handled failure is reported. A hard runner termination can prevent final outputs.

| Output               | When set                       | Meaning / synthetic example                                       |
| -------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `build-code`         | Creation returned a valid code | Returned identifier, e.g. `20260101.1`; otherwise empty           |
| `build-status`       | Valid progress observed        | Last SAP status, e.g. `BUILDING`; otherwise empty                 |
| `build-percentage`   | Valid percentage observed      | Decimal string, e.g. `40`; otherwise empty                        |
| `poll-count`         | Always on handled completion   | Progress HTTP attempts including retries, e.g. `3`; starts at `0` |
| `duration-ms`        | Always on handled completion   | Non-negative monotonic observed duration, e.g. `120000`           |
| `result-json`        | Always on handled completion   | Sanitized schemaVersion 1 result                                  |
| `notification-event` | Always on handled completion   | Valid NotificationEvent v1 `ccv2.build.completed`                 |

`result-json` contains `schemaVersion`, `outcome`, `pollCount`, `retryCount`, `durationMs`, and `timedOut`. Known optional fields are `subscriptionCode`, `applicationCode`, `buildCode`, `buildName`, `branch`, `buildStatus`, `percentage`, `numberOfTasks`, `startedTaskCount`, and `error` (`code`, `message`, optional `httpStatus`). Each JSON output is capped at 16 KiB. There are no raw task payloads, headers, logs, or raw API responses.

The notification carries only supported build fields, safe error information, and approved GitHub context. `retryCount` counts actual extra HTTP attempts, including an authorization refresh replay; it is not the poll count. The workflow run link is included when safely constructible. No Cloud Portal UI link is guessed. The [shared contract](contracts/README.md) is validated at runtime and in tests.

## Lifecycle and failure behavior

| SAP status or failure                               | Result / notification status           | Step    |
| --------------------------------------------------- | -------------------------------------- | ------- |
| `SCHEDULED`, `BUILDING`                             | Continue polling                       | Running |
| `SUCCESS`                                           | `success`                              | Success |
| `FAIL`                                              | `failure`                              | Failure |
| `DELETED`                                           | `cancelled`                            | Failure |
| `UNKNOWN`                                           | `internal-error`                       | Failure |
| Wait timeout                                        | `internal-error`, `BUILD_WAIT_TIMEOUT` | Failure |
| Authentication, API, invalid response, client error | `internal-error`                       | Failure |

`timeout-minutes` limits waiting, including authentication, requests, and retries. It does **not** cancel the SAP build. The remote build may continue. Timeout preserves its last observed status, percentage, and code. SIGINT/SIGTERM abort local requests; no remote delete is attempted. GitHub can terminate a process before outputs or cleanup complete.

Each request has a 30-second timeout and a 256 KiB response limit. Tokens remain memory-only, refresh before expiry (up to 60 seconds early, 10% for short-lived tokens), and are reused until an explicit 401 when expiry is absent. Token requests and progress GETs make at most three transient attempts, with exponential backoff, jitter, and Retry-After. Each Management operation permits one explicit 401 refresh replay. Retries remain subject to the overall timeout.

Create-build POST is **not** automatically retried after timeout, network ambiguity, 5xx, or 429. An explicit 401 permits one token refresh and replay. `CREATE_BUILD_AMBIGUOUS` means check Cloud Portal before starting another build to avoid duplicates. API errors retain HTTP status and only sanitized, bounded problem title/detail. See [security](SECURITY.md).

## Shared dependencies

`@commercekit-tools/notification-contract@0.0.3` and `@commercekit-tools/ccv2-client@0.0.3` are pinned exactly and bundled into `dist/index.js`. Workflow consumers do not install these packages, authenticate to GitHub Packages, or grant `packages: read` to run the bundled Action. Build endpoint validation, polling, deadlines, status mapping, result JSON, outputs, and summaries remain owned by this Action. See the [migration inventory and compatibility checks](docs/shared-packages.md).

Maintainers and CI need GitHub Packages read access for dependency installation; see [CONTRIBUTING.md](CONTRIBUTING.md). Package upgrades require compatibility review and a rebuilt bundle. Publishing a shared package does not release this Action.

## Development and Sandbox verification

See [CONTRIBUTING.md](CONTRIBUTING.md), [API contract review](docs/api-contract.md), and [Sandbox verification](docs/sandbox.md). Ordinary CI is entirely mocked for SAP/Sandbox. All five live Sandbox scenarios passed using the guarded workflow scripts and bundled Action locally before merge; see [validation evidence](docs/build-validation.md). GitHub dispatch was unavailable before the new workflow reached main. No real SAP credentials or subscriptions are used in development tests.

**UNRELEASED.** Follow the complete suite gates in [RELEASING.md](RELEASING.md). Marketplace name availability still requires owner validation in GitHub's release UI.
