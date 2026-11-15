# Consistent Action reporting candidate

## Scope and package gate

Inspected current main `923535d589bd8cebece4f3cbf479608f9535c4c3`. This change keeps every
existing input, endpoint, remote mutation, polling/deadline, retry/refresh policy
and domain outcome in place. It consumes the existing notification-contract
package for input capture/projection, schema/factories, redaction, status style
and Markdown summary rendering. No auth, HTTP or provider-delivery subsystem
was added.

**BLOCKED — normal registry build/merge readiness:** the new public APIs and
Build/Deploy optional context fields require unpublished notification-contract
**0.0.6**. Normal `package.json`, `pnpm-lock.yaml` and `dist` deliberately remain
on published notification-contract **0.0.3** and ccv2-client **0.0.3**. These are
baseline artifacts, not a claim that the richer source is bundled/released.
A source-tarball candidate is tested only in a private isolated consumer; no
permanent `file:` dependency, source alias or fake registry version is committed.
After separately authorized publication, verify exact registry provenance,
repin/rebuild normally and run all required checks before merge or adoption.

## Notification and summary behavior

Every handled outcome reports all **11 input names**. Valid configuration
uses effective normalized defaults; invalid configuration shows safely captured
settings with `inputsValidated=false`. Capture reads each input once and masks
the four authentication values before any public field is read. Token endpoint,
client ID, client secret and resource are always literal `[REDACTED]` in public
context. Received tokens continue to use the existing Action masker.

Shared known-secret/JWT redaction precedes the 256-character per-value bound;
truncation is explicit. API URLs use only a validated safe HTTPS origin. Arbitrary
credential-bearing URLs are not reflected. Missing optional values are visible
as not set. Markdown/HTML control syntax is escaped by the shared renderer.

Build includes subscription/application, branch/name, API origin and polling/
timeout settings. Its existing success/failure/cancelled/internal-error event
semantics remain unchanged. No artificial warning replaces a build error.
The immutable 16-case pre-extraction fixture is retained byte-for-byte; only
additive input context and the intentionally replaced summary presentation are
separated from the legacy comparison and independently asserted.

Each execution attempts a GitHub job summary after outputs, including handled
input/API/authentication/timeout failures. The shared layout is an icon/status
heading followed by Result and Inputs tables, safe Issues when present, and a
validated workflow link when available. Human labels replace internal property
names. Icons/labels reuse the shared status mapping:

| Outcome                       | Style                | Operation behavior                                |
| ----------------------------- | -------------------- | ------------------------------------------------- |
| success                       | ✅ Succeeded         | Existing success behavior                         |
| failure                       | ❌ Failed            | Existing failure behavior                         |
| internal-error                | ❌ CommerceKit error | Existing validation/API/deadline failure behavior |
| cancelled                     | ⏹️ Cancelled         | Existing Action exit policy is retained           |
| action-required (Deploy only) | ⚠️ Action required   | Existing non-failing manual/canary handoff        |

Trusted local outcome/operation enums (and allowlisted Build statuses) retain
their actual semantics when a credential coincidentally equals an enum word.
Public copies of supplied input values remain redacted. Arbitrary API strings
are never restored after sanitization. This prevents masking from manufacturing
an invalid event or a different domain outcome.

Structured result/event JSON is bounded to **64 KiB**, deliberately raised from
16 KiB for the unreleased reporting candidate. Invalid input settings
can expand under JSON Unicode escaping even when each projected value is bounded
to 256 characters. A malformed-Unicode test verifies the event remains present, schema-valid and
below 64 KiB with all input names; the coordinated Deploy test also covers events
above the former 16 KiB bound.
Scalar outputs retain their existing bound and endpoint field validation.

Reporting cannot overwrite the operation result. Event creation failure emits
an empty notification output, a safe warning and an issue in the available
summary; consumers must skip notification delivery when the event is empty.
Each output is attempted independently, and the summary is still attempted if
an output write fails. An output contract failure can fail the Action separately
while keeping the original domain result/event status. An existing operation
error remains the primary Action failure. Summary errors warn without erasing
outputs or changing the operation outcome.

## Validation evidence

Status vocabulary: PASS, FAIL, BLOCKED, NOT RUN.

| Check                                                                | Result                                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Published 0.0.3 baseline frozen installation and full `pnpm quality` | PASS: 182 tests; 99.58% statements, 98.33% branches, 100% functions, 99.56% lines                  |
| Input definition parity with `action.yml`                            | Covered by candidate tests: 11 names, confidentiality/presence policy                              |
| Shared-schema input context and summary/status tests                 | PASS: 207 tests/10 files; 100% statements, 98.60% branches, 100% functions, 100% lines             |
| Actual standalone bundle status/input/masking/summary matrix         | PASS: 5 new status/input/summary cases plus the existing standalone bundle test, mocked fetch only |
| Normal new-source registry CI/bundle consistency                     | BLOCKED by unpublished 0.0.6; baseline normal files remain unchanged                               |
| Real SAP, hosted Sandbox dispatch, live Slack/Teams delivery         | NOT RUN                                                                                            |

The candidate procedure copies the reviewed source into a separate private
workspace, verifies and installs an exact source-packed 0.0.6 tarball, builds its
own bundle, and runs `COMMERCEKIT_CANDIDATE_CONTRACT_VERSION=0.0.6 pnpm quality`.
`scripts/contracts.mjs` permits that explicit candidate mode only with a private
manifest, an installed exact 0.0.6 package and a `file:*.tgz` dependency in that
temporary workspace. The client remains exact registry 0.0.3. Normal mode still
requires exact published 0.0.3; candidate mode never turns normal CI green.

All existing 95% statement/branch/function/line thresholds and production source
inclusion remain unchanged. Original fixtures and remote-operation tests remain.
Synthetic bundle tests run without runtime package installation or registry
credentials and check zero mock requests for invalid configuration. They do not
call SAP, create a hosted Sandbox run, or deliver a provider webhook.

## Reviewed candidate package and final commands

Final tested contract source:
`b88ed58976af9aee532488d82ea09340b35a4d8c` in existing action-kit.
It is an **unpublished source candidate**, not a registry dependency.

- Tarball: `commercekit-tools-notification-contract-0.0.6.tgz`, 18852 bytes.
- SHA256: `645b38e7456e63b96e7630da7d63c1f6ccbf27854b5b7001ff77db435afa2393`.
- Integrity: `sha512-eqV2tVnjmuYtG5ExjqScPCGxxR8MW8QlbeuXMA/YjzKzujgSMf9oMQpvQDqmysGhHLN8918XtNh9gbO7UQH4Ug==`.
- Candidate Action bundle SHA256: `d013e6db0897c6be5248d46203f8b509417097f18924c99aa396dd90af657dbf`.

The final commands actually executed in a fresh private isolated consumer were:

```sh
pnpm install --no-frozen-lockfile
pnpm install --frozen-lockfile
pnpm bundle
COMMERCEKIT_CANDIDATE_CONTRACT_VERSION=0.0.6 pnpm quality
```

The first command resolves only the temporary source-tarball dependency; the next
verifies that exact temporary lockfile. All quality steps passed: formatting,
lint, strict types, schema/compatibility checks, coverage, bundle consistency,
public scan and production dependency audit (no known vulnerabilities). Source
`pnpm format:check`, public scan and `git diff --check` also passed. Normal source
manifests/locks/dist and endpoint/input validation modules have no changes.

No source was copied from the shared package. No normal install uses the
candidate tarball. No publication, Git tag, deployment, provider send or real
SAP request occurred. Registry readiness stays BLOCKED until separately
approved publication and normal consumer regeneration/validation.
