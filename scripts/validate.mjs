import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { validateManifest } from "./lib/catalog.mjs";
import { readBundle } from "./lib/bundle.mjs";
import { assertSource } from "./lib/common.mjs";
const config = JSON.parse(await readFile("marketplace.config.json"));
assertSource(config.source);
const manifest = JSON.parse(await readFile("skills/manifest.json"));
validateManifest(manifest, await readFile("skills/inclusion-list.md"));
const report = JSON.parse(await readFile("skills/source-audit.json"));
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
  `Validated 584-member manifest, fixed-source audit, and scored/unscored fixtures. ${report.entries.filter((e) => e.issues.length).length} members have source blockers; release reviews remain required.`,
);
