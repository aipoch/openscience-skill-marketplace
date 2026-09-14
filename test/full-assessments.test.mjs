import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sha256, assertSource, assertPath } from "../scripts/lib/common.mjs";
import { reportEvaluation } from "../scripts/lib/aipoch-audits.mjs";
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const register = await read("audits/full-inclusion.json");

test("full submission includes all 776 provider-qualified Skills, with 776 valid score references", async () => {
  assert.equal(register.entries.length, 776);
  assert.equal(register.record_count, 776);
  assert.equal(new Set(register.entries.map((e) => e.record_key)).size, 776);
  assert.equal(register.auditor, "AIPOCH");
  assert.equal(register.scope, "submitted-material");
  const counts = Object.fromEntries(
    register.providers.map((p) => [
      p.id,
      register.entries.filter((e) => e.provider_id === p.id).length,
    ]),
  );
  assert.deepEqual(counts, {
    aipoch: 584,
    "google-deepmind": 7,
    "k-dense-ai": 56,
    "nvidia-bionemo": 31,
    "synthetic-sciences": 78,
    yuan1z0825: 20,
  });
  for (const entry of register.entries) {
    assertSource(entry.source);
    assertPath(entry.material_skill_path);
    assert.match(entry.material_skill_sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      entry.report_path,
      `audits/reports/${entry.report_sha256}.json`,
    );
    const bytes = await readFile(entry.report_path);
    assert.equal(sha256(bytes), entry.report_sha256);
    const report = JSON.parse(bytes);
    assert.equal(entry.report_skill_name, report.meta.skill_name);
    assert.equal(
      entry.identity_review_required,
      report.meta.skill_name !== entry.skill_id,
    );
    assert.deepEqual(entry.evaluation, reportEvaluation(report));
    const prefix = `skills/${entry.source.repository.replace("https://github.com/", "").replace("/", "__")}/${entry.source.path}`;
    assert.equal(entry.material_skill_path, `${prefix}/SKILL.md`);
    assert.ok(entry.report_archive_path.startsWith(`${prefix}/`));
  }
});

test("776 input records map exactly to the existing 584-member authority and 192 provider submissions", async () => {
  const manifest = await read("skills/manifest.json");
  const queue = await read("authoring/submissions/index.json");
  assert.deepEqual(register.selection_input, queue.selection_input);
  const expected = new Set([
    ...manifest.entries.map((e) => `aipoch/${e.id}@${e.version}`),
    ...queue.submissions.map((e) => e.submission_key),
  ]);
  assert.deepEqual(
    new Set(register.entries.map((e) => e.record_key)),
    expected,
  );
  for (const entry of register.entries) {
    if (entry.provider_id === "aipoch") {
      assert.equal(
        manifest.entries.find((e) => e.id === entry.skill_id).source_path,
        entry.source.path,
      );
    } else {
      const source = await read(entry.authority);
      assert.equal(source.id, entry.skill_id);
      assert.deepEqual(source.source, entry.source);
    }
  }
});

test("same-name alternatives remain separate and mismatched report identities remain reviewable", async () => {
  assert.ok(
    register.entries.filter((e) => e.skill_id === "clinical-decision-support")
      .length > 1,
  );
  assert.equal(
    register.entries.filter((e) => e.identity_review_required).length,
    12,
  );
  // Identical evidence bytes may be content-addressed once; no Skill record is deduplicated.
  assert.equal(new Set(register.entries.map((e) => e.report_sha256)).size, 773);
  const bindings = await read("audits/registry.json");
  for (const binding of bindings.entries) {
    assert.ok(
      register.entries.some(
        (e) =>
          e.skill_id === binding.id &&
          e.source.repository === binding.source.repository &&
          e.source.path === binding.source.path &&
          e.report_sha256 === binding.report_sha256 &&
          !e.identity_review_required,
      ),
    );
  }
});
