# Third-party notices

This repository is MIT licensed. The exact NotificationEvent v1 schema is vendored from CommerceKit Notifications under MIT; see [contract provenance](contracts/README.md) and [its license](contracts/notify-LICENSE).

The generated [dist/licenses.txt](dist/licenses.txt) is produced by `@vercel/ncc --license licenses.txt` from actual bundled dependencies. It contains package identifiers and full license text for the Actions toolkit and its bundled transitive dependencies, Ajv, ajv-formats, and their dependencies. Rebuild it whenever dependencies change; bundle reproducibility compares it byte-for-byte.

Runtime direct dependencies:

- `@actions/core`: GitHub inputs, masking, outputs, logs, summary, and failure status.
- `ajv`: local NotificationEvent JSON Schema 2020-12 validation.
- `ajv-formats`: URI and date-time validation.

Development tooling: TypeScript and Node types, ESLint with typescript-eslint and globals, Prettier, Vitest and V8 coverage, and ncc. Development-only dependencies are not runtime requirements. Exact versions and transitive licenses are inspectable through package.json and pnpm-lock.yaml. SAP-authored OpenAPI is not included or relicensed.
