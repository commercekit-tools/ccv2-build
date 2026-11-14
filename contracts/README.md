# NotificationEvent contract

The Action uses the public exports of `@commercekit-tools/notification-contract@0.0.3`, published from the MIT-licensed [CommerceKit Action Kit](https://github.com/commercekit-tools/action-kit). The package owns NotificationEvent v1 types, schema, validator, event factory, safe context/links, and generic text sanitization. No schema is vendored locally and no runtime dependency on the Notify Action exists.

`pnpm contracts:check` imports `@commercekit-tools/notification-contract/schema`, checks schemaVersion 1 and exact installed/declared versions of both shared packages, verifies the local duplicate is absent, validates every pre-migration fixture, and executes all 16 compatibility scenarios against the current Action. Checks are offline after dependency installation. Event creation validates at runtime through `createBuildEvent` and `validateNotificationEvent` inside the package. Sandbox assertions use the same public validator.

The compatibility fixtures in `tests/fixtures/build-compatibility.json` were captured from base `ebdc830161cf9122121ddeb137d005f375063997`. They preserve result/event fields, optional omissions, safe messages, status mappings, output ordering, and summaries; generated event identity/timestamps are normalized. JSON object member order is not semantically significant.

Upgrade only to an explicitly reviewed, exact published package version. Review source and license changes, preserve these fixture assertions, run the full quality gate and rebuild dist. Do not fetch a live schema or implicitly track main in routine CI. See [shared-package ownership](../docs/shared-packages.md).
