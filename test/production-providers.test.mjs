import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseProductionProviders,
  assertProviderHistory,
} from "../scripts/lib/production-providers.mjs";
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

test("registered providers remain disjoint from selected original IDs", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../skills/manifest.json", import.meta.url)),
  );
  const plan = JSON.parse(
    await readFile(new URL("../skills/release_plan.json", import.meta.url)),
  );
  const releases = parseProductionProviders(
    await readFile(new URL("../authoring/production.json", import.meta.url)),
    plan.selected,
  );
  assert.equal(manifest.entries.length, 584);
  assert.equal(new Set(releases.map((r) => r.id)).size, releases.length);
});

test("deferred IDs can select a source but authenticated published IDs cannot change origin", () => {
  const selectedOriginals = [{ id: "already-selected" }];
  assert.deepEqual(parse(register(), selectedOriginals), [release]);
  assert.throws(
    () =>
      parse(
        register([{ ...release, id: "already-selected" }]),
        selectedOriginals,
      ),
    /duplicate/,
  );
  const history = {
    root: { skills: [] },
    objects: new Map([
      [
        "releases/provider-skill/1.0.0.json",
        Buffer.from(JSON.stringify({ skill: release })),
      ],
    ]),
  };
  assert.doesNotThrow(() => assertProviderHistory([release], history));
  assert.doesNotThrow(() =>
    assertProviderHistory(
      [
        {
          ...release,
          version: "2.0.0",
          source: { ...release.source, commit: "b".repeat(40) },
        },
      ],
      history,
    ),
  );
  assert.doesNotThrow(() =>
    assertProviderHistory([{ ...release, id: "never-published" }], history),
  );
  for (const source of [
    { ...release.source, repository: "https://github.com/another/skills" },
    { ...release.source, path: "skills/another-directory" },
  ]) {
    assert.throws(
      () =>
        assertProviderHistory(
          [{ ...release, version: "2.0.0", source }],
          history,
        ),
      /published Skill source cannot be replaced/,
    );
  }
});
