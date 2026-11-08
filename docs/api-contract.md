# API contract review

Reviewed 2026-11-08 against SAP Management API **2.0.12**, Sandbox Management **2.0.12-sandbox.1**, and Sandbox Control **1.0.0**.

Production authority: [SAP Cloud Portal API documentation](https://help.sap.com/docs/SAP_COMMERCE_CLOUD_PUBLIC_CLOUD/0fa6bcf4736c46f78c248512391eb467/66abfe678b55457fab235ce8039dda71.html?locale=en-US). The SAP page was available through indexed documentation retrieval; its direct HTML is a client-rendered shell. SAP's authored OpenAPI has agreement-specific license terms and is not redistributed.

Compatibility evidence: [Sandbox commit a787e4b07c487a8a4833541f7f7d8bd4afd9fef4](https://github.com/commercekit-tools/sandbox/tree/a787e4b07c487a8a4833541f7f7d8bd4afd9fef4/apps/ccv2), including README, authentication, API coverage, scenarios, contract audit, production readiness, and both independently authored OpenAPI documents. Read-only live `/openapi.json` and `/openapi/sandbox.json` retrieval confirmed the version and build/control shapes. No live run or token was created.

All paths below are relative to `/v2/subscriptions/{subscriptionCode}`:

| Operation        | Method and path                    | Response                                             | Action usage                |
| ---------------- | ---------------------------------- | ---------------------------------------------------- | --------------------------- |
| createBuild      | POST `/builds`                     | 201, build code                                      | Implemented                 |
| getBuildProgress | GET `/builds/{buildCode}/progress` | 200, progress                                        | Implemented                 |
| getBuilds        | GET `/builds`                      | 200, collection with pagination and status exclusion | Reviewed only               |
| getBuild         | GET `/builds/{buildCode}`          | 200, detail                                          | Reviewed only               |
| getBuildLogs     | GET `/builds/{buildCode}/logs`     | 200, binary octet-stream                             | Reviewed only               |
| deleteBuild      | DELETE `/builds/{buildCode}`       | 204, deletion started                                | Reviewed only; never called |

Creation requires branch and name; applicationCode is optional. SAP requires response code, while Sandbox additionally requires subscriptionCode. The client accepts omission of the latter and checks it against the requested subscription when present. Progress carries buildStatus, percentage, task counts/tasks, identifiers, and optional errorMessage. SAP documents these statuses: SCHEDULED, BUILDING, SUCCESS, FAIL, DELETED, UNKNOWN. Unknown enum values fail response validation. Optional invalid percentage/count values are omitted rather than fabricated; previously observed valid values remain available.

Errors use problem JSON with title/detail; HTTP status is retained. The client bounds/sanitizes messages and ignores all other provider fields. Management requests use the technical-user bearer header. OAuth uses form-encoded client credentials and resource at the supplied token endpoint. Legacy static API-token authentication is intentionally absent.

No official numeric polling interval recommendation was found in the reviewed sources. The initial 60-second default is retained as a conservative client policy, not represented as an SAP mandate. No supported Cloud Portal UI build URL was verified, so events link only to the GitHub workflow run.
