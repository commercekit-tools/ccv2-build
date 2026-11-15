import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import schema from "@commercekit-tools/notification-contract/schema" with { type: "json" };
import { validateNotificationEvent } from "@commercekit-tools/notification-contract";
const root = JSON.parse(readFileSync("package.json", "utf8"));
const candidateVersion = process.env.COMMERCEKIT_CANDIDATE_CONTRACT_VERSION;
if (candidateVersion !== undefined) {
  assert.equal(candidateVersion, "0.0.6");
  assert.equal(root.private, true);
  assert.match(
    root.dependencies["@commercekit-tools/notification-contract"],
    /^file:.+\.tgz$/u,
  );
}
for (const name of ["notification-contract", "ccv2-client"]) {
  const id = "@commercekit-tools/" + name;
  const { default: pkg } = await import(id + "/package.json", {
    with: { type: "json" },
  });
  const expected =
    name === "notification-contract" && candidateVersion
      ? candidateVersion
      : "0.0.3";
  assert.equal(pkg.version, expected);
  if (name !== "notification-contract" || !candidateVersion)
    assert.equal(root.dependencies[id], "0.0.3");
}
assert.equal(schema.properties.schemaVersion.const, 1);
assert(!existsSync("contracts/notification-event-v1.schema.json"));
assert(!existsSync("scripts/update-notify.mjs"));
const fixtures = JSON.parse(
  readFileSync("tests/fixtures/build-compatibility.json", "utf8"),
);
for (const fixture of fixtures)
  validateNotificationEvent(fixture.outputs["notification-event"]);
console.log(
  `Exact shared packages and ${fixtures.length} baseline events validated offline.`,
);
