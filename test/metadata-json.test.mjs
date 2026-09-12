import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  metadataJsonBytes,
  parseMetadataJson,
} from "../scripts/lib/metadata-json.mjs";
import { parseReleaseConfig } from "../scripts/lib/authoring.mjs";

test("metadata boundaries translate nested fields while preserving identifiers and values", () => {
  const value = {
    "example@1.0.0-RC.1+Build": {
      sourceCommit: "a".repeat(40),
      sourcePath: "Skills/MySkill",
      licenseFiles: [{ path: "LICENSE", sha256: "b".repeat(64) }],
      reviewedBy: "CamelCase Name",
      reviewedOn: "2026-09-12",
    },
  };
  const bytes = metadataJsonBytes(value);
  assert.deepEqual(JSON.parse(bytes), {
    "example@1.0.0-RC.1+Build": {
      source_commit: "a".repeat(40),
      source_path: "Skills/MySkill",
      license_files: [{ path: "LICENSE", sha256: "b".repeat(64) }],
      reviewed_by: "CamelCase Name",
      reviewed_on: "2026-09-12",
    },
  });
  assert.deepEqual(parseMetadataJson(bytes), value);
  assert.deepEqual(
    JSON.parse(metadataJsonBytes({ baseRevision: null, rootSha256: "hash" })),
    { base_revision: null, root_sha256: "hash" },
  );
});

test("old and mixed camelCase input is rejected without a compatibility alias", () => {
  for (const value of [
    { schemaVersion: 1 },
    { initialVersion: "1.0.0" },
    { entries: [{ sourcePath: "skills/example" }] },
    { "example@1.0.0": { reviewedBy: "Reviewer" } },
    { baseRevision: null },
    { source_commit: "new", sourceCommit: "old" },
  ])
    assert.throws(
      () => parseMetadataJson(JSON.stringify(value)),
      /invalid metadata field/,
    );
  const example = JSON.parse(
    readFileSync(
      new URL("../authoring/example/release.config.json", import.meta.url),
    ),
  );
  assert.equal(
    parseReleaseConfig(JSON.stringify(example)).displayName,
    "Example Skill",
  );
  for (const [snake, camel] of [
    ["schema_version", "schemaVersion"],
    ["display_name", "displayName"],
    ["license_files", "licenseFiles"],
  ]) {
    const mixed = { ...example, [camel]: example[snake] };
    assert.throws(
      () => parseReleaseConfig(JSON.stringify(mixed)),
      /invalid release/,
    );
    delete mixed[snake];
    assert.throws(
      () => parseReleaseConfig(JSON.stringify(mixed)),
      /invalid release/,
    );
  }
});

test("all committed metadata uses snake_case and round-trips without field or value loss", () => {
  const paths = [
    "marketplace.config.json",
    "skills/manifest.json",
    "skills/source-audit.json",
    "skills/reviews.json",
    "skills/release_plan.json",
    "protocol/fixtures/provenance.json",
    "authoring/example/release.config.json",
  ];
  function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (value === null || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      assert.doesNotMatch(
        key,
        /[A-Z]/,
        `unexpected camelCase metadata field: ${key}`,
      );
      inspect(item);
    }
  }
  for (const path of paths) {
    const bytes = readFileSync(new URL("../" + path, import.meta.url));
    inspect(JSON.parse(bytes));
    assert.deepEqual(
      JSON.parse(metadataJsonBytes(parseMetadataJson(bytes))),
      JSON.parse(bytes),
      path,
    );
  }
});
