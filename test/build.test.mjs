import test from "node:test";
import assert from "node:assert/strict";
import { makeCandidate } from "./fixtures.mjs";
test("catalog snapshots authenticate immutable details and reuse old shard associations when neighbors change", async () => {
  const { buildCatalog } = await import("../scripts/lib/build.mjs");
  const a = makeCandidate("alpha"),
    b = makeCandidate("beta");
  const original = buildCatalog([a, b]);
  const rebuilt = buildCatalog([b, a]);
  assert.deepEqual(original.rootBytes, rebuilt.rootBytes);
  const history = original.objects;
  const next = buildCatalog([a, makeCandidate("gamma")], { history });
  const oldPath = "releases/alpha/1.0.0.json";
  assert.deepEqual(next.objects.get(oldPath), history.get(oldPath));
  const oldShard = JSON.parse(history.get(oldPath)).artifact.path;
  assert.deepEqual(next.objects.get(oldShard), history.get(oldShard));
  assert.equal(next.root.skills.length, 2);
  const changed = makeCandidate("alpha");
  changed.skill.summary = "Changed";
  assert.throws(() => buildCatalog([changed], { history }), /immutable/);
  const changedBytes = makeCandidate("alpha");
  changedBytes.files[0].bytes = Buffer.from(
    changedBytes.files[0].bytes.toString() + "\nchanged",
  );
  assert.throws(() => buildCatalog([changedBytes], { history }), /immutable/);
});

test("publication readiness requires reviewed, byte-bound license evidence for every member", async () => {
  const { prepareCandidates } = await import("../scripts/lib/prepare.mjs");
  const audit = {
    entries: [
      {
        id: "alpha",
        source: {
          repository: "https://github.com/test/source",
          commit: "a".repeat(40),
          path: "skills/alpha",
        },
        description: "Example",
        declaredLicense: "MIT",
        category: "Other",
        issues: [],
      },
      { id: "beta", issues: [{ code: "missing-license", detail: "missing" }] },
    ],
  };
  assert.throws(
    () => prepareCandidates(audit, {}, { initialVersion: "1.0.0" }, {}),
    (e) => e.blockers?.length === 3,
  );
});

test("rebuilding an already published snapshot preserves its original parent revision for promotion recovery", async () => {
  const { buildCatalog } = await import("../scripts/lib/build.mjs");
  const first = buildCatalog([makeCandidate("alpha")]);
  const second = buildCatalog([makeCandidate("alpha"), makeCandidate("beta")], {
    history: first.objects,
    previousRoot: first.root,
  });
  assert.equal(second.root.previous_revision, first.root.revision);
  const retry = buildCatalog([makeCandidate("alpha"), makeCandidate("beta")], {
    history: second.objects,
    previousRoot: second.root,
  });
  assert.deepEqual(retry.rootBytes, second.rootBytes);
});

test("catalog loading checks authenticated references before following them and rejects tampered objects", async () => {
  const { buildCatalog, loadCatalog } =
    await import("../scripts/lib/build.mjs");
  const built = buildCatalog([makeCandidate("alpha")]);
  const loaded = await loadCatalog(built.rootBytes, async (p) =>
    built.objects.get(p),
  );
  assert.deepEqual(loaded.rootBytes, built.rootBytes);
  const badIndex = new Map(built.objects);
  badIndex.set(
    built.root.release_index.path,
    Buffer.from('{"releases":[{"path":"../../secret"}]}'),
  );
  const reads = [];
  await assert.rejects(
    loadCatalog(built.rootBytes, async (p) => {
      reads.push(p);
      return badIndex.get(p);
    }),
    /digest/,
  );
  assert.equal(reads.length, 1);
  const badShard = new Map(built.objects);
  const key = built.root.skills[0].artifact.path;
  badShard.set(key, Buffer.from("wrong"));
  await assert.rejects(
    loadCatalog(built.rootBytes, async (p) => badShard.get(p)),
    /digest/,
  );
});

test("reviewed release preparation binds package bytes and license evidence without inferring author or evaluation", async () => {
  const { prepareCandidates } = await import("../scripts/lib/prepare.mjs");
  const { contentDigest } = await import("../scripts/lib/package.mjs");
  const { sha256 } = await import("../scripts/lib/common.mjs");
  const c = makeCandidate("alpha");
  const reportBytes = Buffer.from('{"meta":{"skill_name":"different-id"}}');
  c.files.push({
    path: "eval_report_alpha.json",
    mode: "100644",
    bytes: reportBytes,
  });
  const license = Buffer.from("Test-only MIT evidence");
  const sourcePath = c.skill.source.path;
  const input = new Map([
    ...c.files.map((file) => [sourcePath + "/" + file.path, file.bytes]),
    ["LICENSE", license],
  ]);
  const snapshot = {
    files: [...input].map(([path, bytes]) => ({
      path,
      mode: "100644",
      size: bytes.length,
    })),
    read: (paths) => new Map(paths.map((p) => [p, input.get(p)])),
  };
  const audit = {
    entries: [
      {
        id: "alpha",
        version: "1.0.0",
        source: c.skill.source,
        description: "Example",
        declaredLicense: "MIT",
        category: "Other",
        issues: [],
      },
    ],
  };
  const review = {
    sourceCommit: c.skill.source.commit,
    contentSha256: contentDigest(c.files),
    reviewedBy: "Test-only reviewer",
    reviewedOn: "2026-09-12",
    licenseExpression: "MIT",
    licenseFiles: [{ path: "LICENSE", sha256: sha256(license) }],
  };
  const reviews = { "alpha@1.0.0": review };
  const config = { publisher: c.skill.publisher };
  const [prepared] = prepareCandidates(audit, reviews, config, snapshot);
  assert.equal(prepared.skill.version, "1.0.0");
  assert.equal(prepared.skill.license.evidence[0].sha256, sha256(license));
  assert.equal("authors" in prepared.skill, false);
  assert.equal("evaluation" in prepared.skill, false);
  audit.entries[0].issues = [
    { code: "invalid-evaluation", detail: "unknown report shape" },
  ];
  assert.throws(
    () => prepareCandidates(audit, reviews, config, snapshot),
    /publication blocked/,
  );
  review.omitEvaluationReason =
    "Explicit test-only omission of unrecognized report";
  const omissionOnly = {
    sourceCommit: review.sourceCommit,
    contentSha256: review.contentSha256,
    omitEvaluationReason: review.omitEvaluationReason,
  };
  for (const reviewedBy of [undefined, "", "  "]) {
    assert.throws(
      () =>
        prepareCandidates(
          audit,
          { "alpha@1.0.0": { ...omissionOnly, reviewedBy } },
          config,
          snapshot,
        ),
      (error) => {
        assert.deepEqual(
          error.blockers.map((blocker) => blocker.code),
          ["missing-review"],
        );
        return true;
      },
    );
  }
  const [omitted] = prepareCandidates(audit, reviews, config, snapshot);
  assert.equal("evaluation" in omitted.skill, false);
  assert.deepEqual(
    omitted.files.find((file) => file.path === "eval_report_alpha.json").bytes,
    reportBytes,
  );
  input.set(sourcePath + "/eval_report_alpha.json", Buffer.from("changed"));
  assert.throws(
    () => prepareCandidates(audit, reviews, config, snapshot),
    /package bytes changed/,
  );
  input.set(sourcePath + "/eval_report_alpha.json", reportBytes);
  audit.entries[0].issues.push({
    code: "invalid-yaml",
    detail: "invalid source",
  });
  assert.throws(
    () => prepareCandidates(audit, reviews, config, snapshot),
    /publication blocked/,
  );
  audit.entries[0].issues = [];
  review.sourceCommit = "0".repeat(40);
  assert.throws(
    () => prepareCandidates(audit, reviews, config, snapshot),
    /invalid reviewed evidence/,
  );
  review.sourceCommit = c.skill.source.commit;
  review.contentSha256 = "0".repeat(64);
  assert.throws(
    () => prepareCandidates(audit, reviews, config, snapshot),
    /package bytes changed/,
  );
  review.contentSha256 = contentDigest(c.files);
  review.licenseFiles[0].sha256 = "0".repeat(64);
  assert.throws(
    () => prepareCandidates(audit, reviews, config, snapshot),
    /evidence changed/,
  );
  review.licenseFiles[0].sha256 = sha256(license);
  audit.entries[0].declaredLicense = review.licenseExpression = "CC-BY-NC-4.0";
  assert.throws(
    () => prepareCandidates(audit, reviews, config, snapshot),
    /policy exception/,
  );
});
