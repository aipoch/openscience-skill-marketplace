import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  readPublicationHolds,
  parsePublicationHolds,
  assertNoPublicationHolds,
} from "../scripts/lib/publication-holds.mjs";
import { readProductionProviders } from "../scripts/lib/production-providers.mjs";
import { parseMetadataJson } from "../scripts/lib/metadata-json.mjs";
import { selectReleaseEntries } from "../scripts/lib/release-plan.mjs";

test("34 provider-qualified records are withheld without deleting any of the 776 scores", async () => {
  const holds = await readPublicationHolds();
  const full = JSON.parse(await readFile("audits/full-inclusion.json"));
  assert.equal(holds.length, 34);
  assert.equal(new Set(holds.map((h) => h.id)).size, 24);
  assert.equal(full.entries.length, 776);
  assert.equal(
    full.entries.filter((e) => e.publication_status === "temporarily-withheld")
      .length,
    34,
  );
  assert.equal(
    full.entries.filter((e) => e.publication_status === "requires-review")
      .length,
    742,
  );
  for (const e of full.entries) {
    assert.equal(typeof e.evaluation.score, "number");
    const hold = holds.find((h) => h.recordKey === e.record_key);
    assert.equal(!!hold, e.publication_status === "temporarily-withheld");
    if (hold) {
      assert.equal(hold.repository, e.source.repository);
      assert.equal(hold.path, e.source.path);
    }
  }
});

test("holds block original and third-party enrollment even after an ID/version/commit change", async () => {
  const holds = await readPublicationHolds();
  for (const hold of holds) {
    assert.throws(
      () =>
        assertNoPublicationHolds(
          [
            {
              id: "renamed",
              version: "9.0.0",
              source: {
                repository: hold.repository,
                path: hold.path,
                commit: "a".repeat(40),
              },
            },
          ],
          holds,
        ),
      /temporarily withheld/,
    );
  }
  const full = JSON.parse(await readFile("audits/full-inclusion.json"));
  assertNoPublicationHolds(
    full.entries.filter((e) => e.publication_status === "requires-review"),
    holds,
  );
});

test("malformed or duplicate hold metadata fails closed", async () => {
  const wire = JSON.parse(await readFile("skills/publication-holds.json"));
  const invalid = structuredClone(wire);
  invalid.entries[0].resume_conditions = [];
  assert.throws(() => parsePublicationHolds(JSON.stringify(invalid)));
  wire.entries.push(wire.entries[0]);
  assert.throws(() => parsePublicationHolds(JSON.stringify(wire)), /duplicate/);
});

test("current production selection contains no withheld source directories", async () => {
  const config = parseMetadataJson(await readFile("marketplace.config.json"));
  const manifest = parseMetadataJson(await readFile("skills/manifest.json"));
  const selected = selectReleaseEntries(
    await readFile("skills/release_plan.json"),
    manifest.entries,
    config.source,
  );
  const providers = await readProductionProviders(selected);
  const hold = (await readPublicationHolds()).find(
    (h) =>
      h.repository === config.source.repository &&
      !providers.some((p) => p.id === h.id),
  );
  await assert.rejects(
    readProductionProviders([
      ...selected,
      { id: hold.id, sourcePath: hold.path },
    ]),
    /temporarily withheld/,
  );
});
