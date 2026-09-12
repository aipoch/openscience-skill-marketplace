import { parseMetadataJson } from "./lib/metadata-json.mjs";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { selectReleaseEntries } from "./lib/release-plan.mjs";
import { validateManifest } from "./lib/catalog.mjs";
import { readBundle } from "./lib/bundle.mjs";
import { assertSource } from "./lib/common.mjs";
const config = parseMetadataJson(await readFile("marketplace.config.json"));
assertSource(config.source);
const manifest = parseMetadataJson(await readFile("skills/manifest.json"));
validateManifest(manifest, await readFile("skills/inclusion-list.md"));
const report = parseMetadataJson(await readFile("skills/source-audit.json"));
assert.deepEqual(report.source, config.source);
assert.equal(report.memberCount, 584);
assert.deepEqual(
  report.entries.map(({ id, category, collection, sourcePath, version }) => ({
    id,
    category,
    collection,
    sourcePath,
    version,
  })),
  manifest.entries,
);
const selected = selectReleaseEntries(
  await readFile("skills/release_plan.json"),
  manifest.entries,
  config.source,
);
const fixtures = await readBundle("protocol/fixtures/snapshot");
assert.equal(fixtures.root.skills.length, 2);
const scored = fixtures.root.skills.find(
  (s) => s.id === "primary-plan-recommender",
);
assert.equal(scored.evaluation.score, 89);
assert.equal(scored.evaluation.dynamic_score.score, 88.4);
assert.equal("skill_version" in scored.evaluation, false);
assert.equal(
  "evaluation" in fixtures.root.skills.find((s) => s.id === "pdf-to-ppt-pack"),
  false,
);
console.log(
  `Validated 584-member manifest, fixed-source audit, ${selected.length} selected / ${manifest.entries.length - selected.length} deferred members, and scored/unscored fixtures. ${report.entries.filter((e) => e.issues.length).length} members have source blockers; release reviews remain required.`,
);
