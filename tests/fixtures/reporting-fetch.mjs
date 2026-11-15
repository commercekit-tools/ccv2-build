import { writeFileSync } from "node:fs";

// The standalone test supplies scenario data through the child environment.
// This preload is copied verbatim; no data is interpolated into JavaScript.
const status = process.env.COMMERCEKIT_TEST_BUILD_STATUS;
if (!new Set(["SUCCESS", "FAIL", "DELETED", "UNKNOWN", "invalid"]).has(status))
  throw new Error("Unexpected synthetic build scenario.");

let requests = 0;
process.once("exit", () =>
  writeFileSync(new URL("./requests", import.meta.url), String(requests)),
);
globalThis.fetch = async (url, init) => {
  requests++;
  url = String(url);
  if (
    ![
      "https://auth.example.invalid",
      "https://portalapi.commerce.ondemand.com",
    ].includes(new URL(url).origin)
  )
    throw new Error("Unexpected network destination");
  if (init.redirect !== "error") throw new Error("Unsafe redirects");
  if (url.includes("oauth2"))
    return Response.json({
      access_token: "SYNTHETIC_BUNDLE_TOKEN",
      token_type: "Bearer",
    });
  if (init.method === "POST")
    return Response.json({ code: "synthetic.1" }, { status: 201 });
  return Response.json({ buildStatus: status, percentage: 100 });
};
