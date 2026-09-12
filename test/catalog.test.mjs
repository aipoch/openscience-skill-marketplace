import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseInclusionList } from "../scripts/lib/catalog.mjs";

test("the approved list contains exactly 584 unique members with the approved category counts", async () => {
  const entries = parseInclusionList(
    await readFile(
      new URL("../skills/inclusion-list.md", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(entries.length, 584);
  assert.equal(new Set(entries.map((x) => x.id)).size, 584);
  const counts = (field) =>
    Object.fromEntries(
      [...new Set(entries.map((x) => x[field]))]
        .sort()
        .map((v) => [v, entries.filter((x) => x[field] === v).length]),
    );
  assert.deepEqual(counts("category"), {
    "academic-writing": 123,
    "data-analysis": 153,
    "evidence-insight": 141,
    other: 95,
    "protocol-design": 72,
  });
  assert.ok(entries.every((entry) => !("inclusionTier" in entry)));
  assert.throws(
    () =>
      parseInclusionList(
        "### Other（2）\n- `one` — catalog-candidate — scientific-skills\n- `one` — catalog-candidate — scientific-skills",
      ),
    /duplicate/,
  );
});

test("malformed frontmatter remains a blocker even when its identity can be recovered", async () => {
  const { inspectFrontmatter } = await import("../scripts/lib/catalog.mjs");
  const result = inspectFrontmatter(
    "---\nname: broken\ndescription: Use this: then that\nlicense: MIT\n---\n",
  );
  assert.equal(result.name, "broken");
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /Nested mappings/);
  assert.equal(
    inspectFrontmatter("---\nname: ok\ndescription: fine\n---\n").valid,
    true,
  );
});

test("upstream evaluation preserves original final and fractional scores without inventing a Skill version", async () => {
  const { extractEvaluation } = await import("../scripts/lib/catalog.mjs");
  const source = {
    repository: "https://github.com/aipoch/medical-research-skills",
    commit: "d92441066ea6259967469be8e0c8c7b6587928ab",
    path: "awesome-med-research-skills/Protocol Design/primary-plan-recommender",
  };
  const report = {
    meta: { skill_name: "primary-plan-recommender", evaluator_version: "2.0" },
    final: { score: 89, max: 100 },
    static_score: { subtotal: 91, max: 100 },
    dynamic_score: { execution_avg: 88.4, max: 100 },
  };
  const result = extractEvaluation(report, source, "primary-plan-recommender");
  assert.equal(result.score, 89);
  assert.equal(result.dynamicScore.score, 88.4);
  assert.equal(result.evaluatorVersion, "2.0");
  assert.equal("skillVersion" in result, false);
  assert.match(
    result.reportUrl,
    /\/blob\/d92441066ea6259967469be8e0c8c7b6587928ab\//,
  );
  assert.equal(
    extractEvaluation(undefined, source, "primary-plan-recommender"),
    undefined,
  );
  for (const score of [-1, 101, NaN, Infinity, "89", null])
    assert.throws(
      () =>
        extractEvaluation(
          { ...report, final: { score, max: 100 } },
          source,
          "primary-plan-recommender",
        ),
      /score/,
    );
  assert.throws(
    () =>
      extractEvaluation(
        { ...report, meta: { skill_name: "unrelated" } },
        source,
        "primary-plan-recommender",
      ),
    /identity/,
  );
});

test("manifest paths must map the exact authority and cannot omit members or substitute source collections", async () => {
  const { validateManifest } = await import("../scripts/lib/catalog.mjs");
  const authority = await readFile(
    new URL("../skills/inclusion-list.md", import.meta.url),
  );
  const manifest = JSON.parse(
    await readFile(new URL("../skills/manifest.json", import.meta.url)),
  );
  validateManifest(manifest, authority);
  assert.throws(
    () =>
      validateManifest(
        { ...manifest, entries: manifest.entries.slice(1) },
        authority,
      ),
    /membership/,
  );
  const changed = structuredClone(manifest);
  changed.entries[0].sourcePath = "other/repo";
  assert.throws(() => validateManifest(changed, authority), /source/);
});

test("source audit reports YAML, license and resource blockers without dropping any selected member", async () => {
  const { auditSources } = await import("../scripts/lib/source.mjs");
  const files = new Map([
    [
      "collection/one/SKILL.md",
      Buffer.from("---\nname: one\ndescription: fine\n---\n"),
    ],
    [
      "collection/two/SKILL.md",
      Buffer.from("---\nname: two\ndescription: broken: YAML\n---\n"),
    ],
  ]);
  const snapshot = {
    files: [...files].map(([path, bytes]) => ({
      path,
      size: bytes.length,
      mode: "100644",
    })),
    read: (paths) => new Map(paths.map((p) => [p, files.get(p)])),
  };
  const manifest = {
    entries: [
      { id: "one", sourcePath: "collection/one" },
      { id: "two", sourcePath: "collection/two" },
    ],
  };
  const result = auditSources(manifest, snapshot, {
    repository: "https://github.com/test/source",
    commit: "a".repeat(40),
  });
  assert.equal(result.entries.length, 2);
  assert.equal(
    result.entries[0].issues.some((x) => x.code === "missing-license"),
    true,
  );
  assert.equal(
    result.entries[1].issues.some((x) => x.code === "invalid-yaml"),
    true,
  );
});

test("source audit discovers versioned audit filenames without fabricating absent scores or selecting ambiguous reports", async () => {
  const { auditSources } = await import("../scripts/lib/source.mjs");
  const source = {
    repository: "https://github.com/test/source",
    commit: "a".repeat(40),
  };
  const root = "skills/example";
  const report = Buffer.from(
    JSON.stringify({
      meta: { skill_name: "example" },
      final: { score: 90, max: 100 },
    }),
  );
  const files = new Map([
    [
      root + "/SKILL.md",
      Buffer.from(
        "---\nname: example\ndescription: Example\nlicense: MIT\n---\n",
      ),
    ],
    [root + "/example_audit_result_v2.json", report],
  ]);
  const snapshot = () => ({
    files: [...files].map(([path, bytes]) => ({
      path,
      mode: "100644",
      size: bytes.length,
    })),
    read: (paths) => new Map(paths.map((p) => [p, files.get(p)])),
  });
  const manifest = { entries: [{ id: "example", sourcePath: root }] };
  const entry = auditSources(manifest, snapshot(), source).entries[0];
  assert.equal(entry.evaluation.score, 90);
  assert.ok(
    entry.evaluation.reportUrl.endsWith("/example_audit_result_v2.json"),
  );
  files.set(root + "/eval_report_example_result.json", report);
  const ambiguous = auditSources(manifest, snapshot(), source).entries[0];
  assert.equal("evaluation" in ambiguous, false);
  assert.ok(ambiguous.issues.some((x) => x.code === "ambiguous-evaluation"));
});
