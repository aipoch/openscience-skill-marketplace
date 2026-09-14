import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSubmissionIndex } from "../scripts/lib/submission-index.mjs";
import { parseReleaseConfig } from "../scripts/lib/authoring.mjs";
import { metadataJsonBytes } from "../scripts/lib/metadata-json.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const original = JSON.parse(read("authoring/submissions/index.json"));
const authority = JSON.parse(read("skills/manifest.json")).entries;
const production = JSON.parse(read("authoring/production.json")).releases;
const parse = (wire, releases = production) =>
  parseSubmissionIndex(JSON.stringify(wire), authority, releases);

test("queue keeps provider identity outside v1 configs and decodes JSON at the boundary", () => {
  const index = parse(original);
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.summary.recordCount, 192);
  assert.equal(index.summary.runtimeIdCollisions, 166);
  assert.equal(index.submissions[0].providerId, "google-deepmind");
  assert.equal(Object.hasOwn(index.submissions[0], "provider_id"), false);
  assert.deepEqual(JSON.parse(metadataJsonBytes(index)), original);
  for (const record of index.submissions) {
    const release = parseReleaseConfig(read(record.releaseConfig));
    assert.equal(release.schemaVersion, 1);
    assert.equal(Object.hasOwn(release, "provider"), false);
  }
  const release = JSON.parse(read(index.submissions[0].releaseConfig));
  assert.throws(
    () => parseReleaseConfig(JSON.stringify({ ...release, schema_version: 2 })),
    /invalid release/,
  );
  assert.throws(
    () =>
      parseReleaseConfig(
        JSON.stringify({ ...release, provider: original.providers[0] }),
      ),
    /invalid release/,
  );
  const camelCase = structuredClone(original);
  camelCase.submissions[0].providerId = camelCase.submissions[0].provider_id;
  delete camelCase.submissions[0].provider_id;
  assert.throws(() => parse(camelCase), /invalid submission index/);
});

test("queue derives collision constraints from historical and production IDs", () => {
  const omitted = structuredClone(original);
  omitted.submissions[0].publication_constraints = [];
  omitted.summary.runtime_id_collisions--;
  assert.throws(() => parse(omitted), /runtime ID collision/);
  const newCandidate = original.submissions.find(
    (record) => record.publication_constraints.length === 0,
  );
  const expandedProduction = [...production, { id: newCandidate.skill_id }];
  assert.throws(
    () => parse(original, expandedProduction),
    /runtime ID collision/,
  );
  const updated = structuredClone(original);
  for (const record of updated.submissions.filter(
    (record) => record.skill_id === newCandidate.skill_id,
  )) {
    record.publication_constraints = ["runtime-id-collision"];
    updated.summary.runtime_id_collisions++;
  }
  assert.doesNotThrow(() => parse(updated, expandedProduction));
  assert.throws(() => parse(updated), /runtime ID collision/);
});

test("queue checks references, states and counts without depending on object key order", () => {
  const reordered = structuredClone(original);
  reordered.summary = Object.fromEntries(
    Object.entries(reordered.summary).reverse(),
  );
  assert.doesNotThrow(() => parse(reordered));
  for (const [mutate, message] of [
    [(index) => index.summary.record_count++, /summary/],
    [(index) => index.providers[0].record_count++, /provider count/],
    [
      (index) => {
        index.providers[0].commit = "0".repeat(40);
      },
      /provider\/source/,
    ],
    [
      (index) => {
        index.submissions[0].state = "pending-review";
      },
      /state/,
    ],
    [
      (index) => {
        index.submissions[0].release_config =
          index.submissions[1].release_config;
      },
      /submission key/,
    ],
    [
      (index) => {
        index.submissions[0].provider_id = "unknown-provider";
      },
      /unknown provider/,
    ],
    [(index) => index.submissions.reverse(), /sorted/],
  ]) {
    const invalid = structuredClone(original);
    mutate(invalid);
    assert.throws(() => parse(invalid), message);
  }
});
