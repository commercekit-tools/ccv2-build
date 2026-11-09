import { readInputs } from "../src/inputs.js";
import { Sanitizer } from "../src/security.js";
export const raw: Record<string, string> = {
  "token-endpoint": "https://auth.example.invalid/oauth2/token",
  "client-id": "FAKE_CLIENT_ID",
  "client-secret": "FAKE_CLIENT_SECRET",
  resource: "FAKE_RESOURCE",
  "subscription-code": "synthetic-subscription",
  branch: "feature/test",
  "build-name": "synthetic-build",
};
export const inputs = () =>
  readInputs((n) => raw[n] ?? "", new Sanitizer(() => {}));
