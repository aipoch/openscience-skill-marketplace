import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseProductionProviders } from "../scripts/lib/production-providers.mjs";
import { metadataJsonBytes } from "../scripts/lib/metadata-json.mjs";

const release = {
  schemaVersion: 1,
  id: "provider-skill",
  version: "1.0.0",
  category: "Data Analysis",
  source: {
    repository: "https://github.com/example/skills",
    commit: "a".repeat(40),
    path: "skills/provider-skill",
  },
  licenseFiles: ["LICENSE"],
};
const register = (releases = [release]) => ({ schemaVersion: 1, releases });
const parse = (value, authority = []) =>
  parseProductionProviders(metadataJsonBytes(value), authority);

test("production registration rejects malformed, implicit, duplicate and legacy enrollment", () => {
  assert.deepEqual(parse(register()), [release]);
  assert.deepEqual(parse(register([])), []);
  for (const value of [
    null,
    [],
    {},
    { schemaVersion: 2, releases: [] },
    { ...register(), discover: true },
    { schemaVersion: 1, releases: null },
  ])
    assert.throws(() => parse(value), /register/);
  assert.throws(() => parse(register(), [{ id: release.id }]), /duplicate/);
  assert.throws(() => parse(register([release, release])), /duplicate/);
  assert.throws(
    () => parse(register([release, { ...release, id: "alias" }])),
    /duplicate/,
  );
  for (const mutate of [
    (r) => (r.source.commit = "main"),
    (r) => (r.source.path = "../outside"),
    (r) => (r.category = "data-analysis"),
    (r) => (r.unreviewed = true),
  ]) {
    const r = structuredClone(release);
    mutate(r);
    assert.throws(() => parse(register([r])), /release.config|source|path/);
  }
  const legacy = JSON.parse(metadataJsonBytes(register()));
  legacy.releases[0].licenseFiles = legacy.releases[0].license_files;
  delete legacy.releases[0].license_files;
  assert.throws(
    () => parseProductionProviders(JSON.stringify(legacy), []),
    /release.config/,
  );
});

test("registered providers remain disjoint from the frozen original authority", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../skills/manifest.json", import.meta.url)),
  );
  const releases = parseProductionProviders(
    await readFile(new URL("../authoring/production.json", import.meta.url)),
    manifest.entries,
  );
  assert.equal(manifest.entries.length, 584);
  assert.equal(new Set(releases.map((r) => r.id)).size, releases.length);
});
