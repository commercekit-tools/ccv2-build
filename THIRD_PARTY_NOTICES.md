# Third-party notices

This repository is MIT licensed. The shared CommerceKit Action Kit packages are MIT licensed; see [contract ownership](contracts/README.md).

The generated [dist/licenses.txt](dist/licenses.txt) is produced by `@vercel/ncc --license licenses.txt` from actual bundled dependencies. It contains package identifiers and full license text for both shared CommerceKit packages, the Actions toolkit and its bundled transitive dependencies, Ajv, ajv-formats, and their dependencies. Rebuild it whenever dependencies change; bundle reproducibility compares it byte-for-byte.

Runtime direct dependencies:

- `@actions/core`: GitHub inputs, masking, outputs, logs, summary, and failure status.
- `@commercekit-tools/ccv2-client@0.0.2`: technical-user authentication, token lifecycle, validated transport, retry policies, and safe problem facts.
- `@commercekit-tools/notification-contract@0.0.2`: NotificationEvent v1 types/schema, validation, factories, context/links, and text sanitization. Its exact Ajv and ajv-formats dependencies provide JSON Schema 2020-12, URI, and date-time validation.

Development tooling: TypeScript and Node types, ESLint with typescript-eslint and globals, Prettier, Vitest and V8 coverage, and ncc. Development-only dependencies are not runtime requirements. Exact versions and transitive licenses are inspectable through package.json and pnpm-lock.yaml. SAP-authored OpenAPI is not included or relicensed.
