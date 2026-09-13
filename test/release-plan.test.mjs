import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
  selectReleaseEntries,
  assertReleaseSelection,
} from "../scripts/lib/release-plan.mjs";
import {
  metadataJsonBytes,
  parseMetadataJson,
} from "../scripts/lib/metadata-json.mjs";
import { prepareCandidates } from "../scripts/lib/prepare.mjs";
import { buildCatalog, loadCatalog } from "../scripts/lib/build.mjs";
import { contentDigest } from "../scripts/lib/package.mjs";
import { sha256 } from "../scripts/lib/common.mjs";
import { readBundle } from "../scripts/lib/bundle.mjs";
import { toAppEntry } from "../scripts/lib/protocol.mjs";
import { makeCandidate } from "./fixtures.mjs";

const source = {
  repository: "https://github.com/test/source",
  commit: "a".repeat(40),
};
const entries = ["alpha", "beta", "gamma"].map((id) => ({
  id,
  version: "1.0.0",
  sourcePath: `skills/${id}`,
}));
const identity = ({ id, version }) => ({ id, version });
function plan() {
  return {
    schemaVersion: 1,
    source,
    selected: entries.slice(0, 2).map(identity),
    deferred: [{ ...identity(entries[2]), reason: "Test-only source issue" }],
  };
}
const select = (value, authority = entries) =>
  selectReleaseEntries(metadataJsonBytes(value), authority, source);

test("release plans require an exact, versioned partition and a matching source", () => {
  const value = plan();
  const original = structuredClone(value);
  assert.deepEqual(select(value), entries.slice(0, 2));
  assert.deepEqual(value, original);
  for (const mutate of [
    (p) => p.selected.push(p.selected[0]),
    (p) => p.deferred.push(p.deferred[0]),
    (p) => p.deferred.push({ ...p.selected[0], reason: "Overlap" }),
    (p) => p.selected.pop(),
    (p) => (p.selected[0].id = "unknown"),
    (p) => (p.selected[0].version = "2.0.0"),
    (p) => (p.source = { ...source, commit: "b".repeat(40) }),
    (p) =>
      (p.source = { ...source, repository: "https://github.com/other/source" }),
    (p) => (p.selected = []),
    (p) => (p.selected[0].version = "latest"),
    (p) => (p.deferred[0].reason = " \n\t"),
    (p) => delete p.deferred[0].reason,
    (p) => (p.deferred = null),
    (p) => (p.selected[0].reason = "Unexpected field"),
    (p) => (p.skipErrors = true),
  ]) {
    const changed = structuredClone(plan());
    mutate(changed);
    assert.throws(() => select(changed), /release plan/);
  }
  const legacy = JSON.parse(metadataJsonBytes(plan()));
  legacy.schemaVersion = legacy.schema_version;
  delete legacy.schema_version;
  assert.throws(
    () => selectReleaseEntries(JSON.stringify(legacy), entries, source),
    /invalid release plan/,
  );
  assert.throws(
    () => select(plan(), [...entries, entries[0]]),
    /duplicate members/,
  );
});

test("deferred source issues are excluded but every selected license and source gate remains mandatory", () => {
  const candidates = entries.map((e) => makeCandidate(e.id));
  const license = Buffer.from("Test-only license evidence");
  const files = new Map([["LICENSE", license]]);
  for (const candidate of candidates)
    for (const file of candidate.files)
      files.set(candidate.skill.source.path + "/" + file.path, file.bytes);
  const snapshot = {
    files: [...files].map(([path, bytes]) => ({
      path,
      mode: "100644",
      size: bytes.length,
    })),
    read: (paths) => new Map(paths.map((path) => [path, files.get(path)])),
  };
  const audited = entries.map((e, i) => ({
    ...e,
    source: candidates[i].skill.source,
    description: "Test-only fixture",
    category: "Other",
    declaredLicense: "MIT",
    issues:
      i === 2
        ? [{ code: "invalid-yaml", detail: "Deferred test fixture" }]
        : [],
  }));
  const selected = select(plan(), audited);
  const config = { publisher: candidates[0].skill.publisher };
  assert.throws(
    () => prepareCandidates({ entries: selected }, {}, config, snapshot),
    (error) => {
      assert.deepEqual(
        error.blockers.map((b) => [b.id, b.code]),
        [
          ["alpha", "missing-review"],
          ["beta", "missing-review"],
        ],
      );
      return true;
    },
  );
  const reviews = Object.fromEntries(
    candidates.slice(0, 2).map((c) => [
      `${c.skill.id}@1.0.0`,
      {
        sourceCommit: source.commit,
        contentSha256: contentDigest(c.files),
        reviewedBy: "Test-only reviewer",
        reviewedOn: "2026-09-12",
        licenseExpression: "MIT",
        licenseFiles: [{ path: "LICENSE", sha256: sha256(license) }],
      },
    ]),
  );
  assert.equal(
    prepareCandidates({ entries: selected }, reviews, config, snapshot).length,
    2,
  );
  selected[0].issues.push({
    code: "invalid-yaml",
    detail: "Unexpected selected failure",
  });
  assert.throws(
    () => prepareCandidates({ entries: selected }, reviews, config, snapshot),
    /publication blocked/,
  );
  selected[0].issues = [];
  reviews["alpha@1.0.0"].contentSha256 = "0".repeat(64);
  assert.throws(
    () => prepareCandidates({ entries: selected }, reviews, config, snapshot),
    /package bytes changed/,
  );
});

test("selected listings and details retain history, while the signing guard rejects a different selection", async () => {
  const candidates = entries.map((e) => makeCandidate(e.id));
  const previous = buildCatalog(candidates);
  const selected = select(plan());
  const built = buildCatalog(
    candidates.filter((c) => selected.some((e) => e.id === c.skill.id)),
    { history: previous.objects, previousRoot: previous.root },
  );
  assertReleaseSelection(built.root, selected, source);
  assert.deepEqual(
    built.root.skills.map((s) => s.id),
    ["alpha", "beta"],
  );
  assert.deepEqual(
    built.objects.get("releases/gamma/1.0.0.json"),
    previous.objects.get("releases/gamma/1.0.0.json"),
  );
  const loaded = await loadCatalog(built.rootBytes, async (path) =>
    built.objects.get(path),
  );
  for (const listing of loaded.root.skills) {
    const detail = JSON.parse(loaded.objects.get(listing.release.path));
    assert.deepEqual(toAppEntry(listing), toAppEntry(detail.skill));
  }
  assert.deepEqual(
    buildCatalog(candidates.slice(0, 2), {
      history: built.objects,
      previousRoot: built.root,
    }).rootBytes,
    built.rootBytes,
  );
  assert.throws(
    () => assertReleaseSelection(previous.root, selected, source),
    /exactly the selected/,
  );
  for (const mutate of [
    (root) => root.skills.pop(),
    (root) => (root.skills[1] = root.skills[0]),
    (root) => (root.skills[0].id = "gamma"),
    (root) => (root.skills[0].version = "2.0.0"),
    (root) =>
      (root.skills[0].source.repository = "https://github.com/other/source"),
    (root) => (root.skills[0].source.commit = "b".repeat(40)),
    (root) => (root.skills[0].source.path = "skills/elsewhere"),
  ]) {
    const root = structuredClone(built.root);
    mutate(root);
    assert.throws(
      () => assertReleaseSelection(root, selected, source),
      /production snapshot/,
    );
  }
  assert.throws(
    () => assertReleaseSelection({ skills: [] }, [], source),
    /exactly the selected/,
  );
});

test("committed release adds one hundred reviewed members while retaining the previous batch and review gates", async () => {
  const manifest = parseMetadataJson(
    await readFile(new URL("../skills/manifest.json", import.meta.url)),
  );
  const config = parseMetadataJson(
    await readFile(new URL("../marketplace.config.json", import.meta.url)),
  );
  const bytes = await readFile(
    new URL("../skills/release_plan.json", import.meta.url),
  );
  const selected = selectReleaseEntries(bytes, manifest.entries, config.source);
  const retainedIds = [
    "abstract-summarizer",
    "abstract-trimmer",
    "academic-abstract-refiner",
    "academic-highlight-generator",
    "anatomy-quiz-master",
    "anki-card-creator",
    "arxiv-preflight",
    "author-response-builder",
    "automated-soap-note-generator",
    "biomed-outline-generator",
    "biotech-pitch-deck-narrative",
    "blind-review-sanitizer",
    "claim-strength-calibrator",
    "conference-abstract-adaptor",
    "conference-abstract-writer",
    "conference-poster-pitch",
    "consistency-checker-across-manuscript",
    "cover-letter-drafter",
    "dei-statement-drafter",
    "discussion-composer",
    "ectd-xml-compiler",
  ];
  const selectedIds = selected.map(({ id }) => id).sort();
  assert.equal(selected.length, 121);
  for (const id of retainedIds) assert.ok(selectedIds.includes(id), id);
  assert.ok(selected.every(({ version }) => version === "1.0.0"));
  assert.deepEqual(
    parseMetadataJson(bytes)
      .deferred.map((entry) => entry.id)
      .sort(),
    manifest.entries
      .filter((entry) => !selectedIds.includes(entry.id))
      .map((entry) => entry.id)
      .sort(),
  );
  const audit = parseMetadataJson(
    await readFile(new URL("../skills/source-audit.json", import.meta.url)),
  );
  const reviews = parseMetadataJson(
    await readFile(new URL("../skills/reviews.json", import.meta.url)),
  );
  assert.deepEqual(
    Object.entries(reviews)
      .filter(([, review]) => review.reviewedBy)
      .map(([key]) => key)
      .sort(),
    selectedIds.map((id) => `${id}@1.0.0`).sort(),
  );
  assert.equal(reviews["abstract-trimmer@1.0.0"].reviewedBy, "ewen-poch");
  assert.throws(
    () =>
      prepareCandidates(
        { entries: selectReleaseEntries(bytes, audit.entries, config.source) },
        {
          ...reviews,
          "abstract-trimmer@1.0.0": {
            ...reviews["abstract-trimmer@1.0.0"],
            reviewedBy: "",
          },
        },
        config,
        {},
      ),
    (error) => {
      assert.deepEqual(
        error.blockers.map(({ id, code }) => ({ id, code })),
        [{ id: "abstract-trimmer", code: "missing-review" }],
      );
      return true;
    },
  );
});

test("catalog CLI uses the explicit plan and fails the whole selected batch when review is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skill-release-selection-"));
  try {
    const sourceDirectory = join(directory, "upstream");
    const inputDirectory = join(directory, "input");
    await mkdir(sourceDirectory);
    await mkdir(join(inputDirectory, "skills"), { recursive: true });
    const manifestBytes = await readFile(
      new URL("../skills/manifest.json", import.meta.url),
    );
    const manifest = parseMetadataJson(manifestBytes);
    const selected = manifest.entries.slice(0, 2);
    const inputCandidates = selected.map((e) => makeCandidate(e.id));
    for (const [index, entry] of selected.entries()) {
      await mkdir(join(sourceDirectory, entry.sourcePath), { recursive: true });
      await writeFile(
        join(sourceDirectory, entry.sourcePath, "SKILL.md"),
        inputCandidates[index].files[0].bytes,
      );
    }
    const license = Buffer.from("Test-only MIT evidence");
    await writeFile(join(sourceDirectory, "LICENSE"), license);
    const git = (args) =>
      execFileSync("git", ["-C", sourceDirectory, ...args], {
        encoding: "utf8",
      });
    git(["init", "--quiet"]);
    git(["add", "."]);
    git([
      "-c",
      "user.name=Test-only fixture",
      "-c",
      "user.email=fixture@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "test fixture",
    ]);
    const source = {
      repository: "https://github.com/test/source",
      commit: git(["rev-parse", "HEAD"]).trim(),
    };
    const config = {
      initialVersion: "1.0.0",
      source,
      publisher: inputCandidates[0].skill.publisher,
    };
    await writeFile(
      join(inputDirectory, "marketplace.config.json"),
      metadataJsonBytes(config),
    );
    await writeFile(
      join(inputDirectory, "skills/manifest.json"),
      manifestBytes,
    );
    await writeFile(
      join(inputDirectory, "skills/inclusion-list.md"),
      await readFile(new URL("../skills/inclusion-list.md", import.meta.url)),
    );
    await writeFile(
      join(inputDirectory, "skills/release_plan.json"),
      metadataJsonBytes({
        schemaVersion: 1,
        source,
        selected: selected.map(identity),
        deferred: manifest.entries.slice(2).map((e) => ({
          ...identity(e),
          reason: "Excluded from synthetic CLI fixture",
        })),
      }),
    );
    const reviews = Object.fromEntries(
      selected.map((e, i) => [
        `${e.id}@${e.version}`,
        {
          sourceCommit: source.commit,
          contentSha256: contentDigest(inputCandidates[i].files),
          reviewedBy: "Test-only reviewer",
          reviewedOn: "2026-09-12",
          licenseExpression: "MIT",
          licenseFiles: [{ path: "LICENSE", sha256: sha256(license) }],
        },
      ]),
    );
    await writeFile(
      join(inputDirectory, "skills/reviews.json"),
      metadataJsonBytes(reviews),
    );
    const command = fileURLToPath(
      new URL("../scripts/build-catalog.mjs", import.meta.url),
    );
    const run = (output) =>
      spawnSync(
        process.execPath,
        [command, "--source", sourceDirectory, "--output", output],
        { cwd: inputDirectory, encoding: "utf8" },
      );
    const output = join(directory, "candidate");
    const success = run(output);
    assert.equal(success.status, 0, success.stderr);
    const built = await readBundle(output);
    assertReleaseSelection(built.root, selected, source);
    assert.equal(built.root.skills.length, 2);
    delete reviews[`${selected[0].id}@${selected[0].version}`];
    await writeFile(
      join(inputDirectory, "skills/reviews.json"),
      metadataJsonBytes(reviews),
    );
    const failedOutput = join(directory, "blocked");
    const failure = run(failedOutput);
    assert.notEqual(failure.status, 0);
    const report = parseMetadataJson(
      await readFile(join(failedOutput, "publication-blockers.json")),
    );
    assert.deepEqual(
      report.blockers.map((b) => [b.id, b.code]),
      [[selected[0].id, "missing-review"]],
    );
    await assert.rejects(readFile(join(failedOutput, "marketplace.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
