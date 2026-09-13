import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toAppEntry } from "../scripts/lib/protocol.mjs";
import { unzipSync } from "fflate";
import { makeCandidate } from "./fixtures.mjs";
import {
  prepareCandidates,
  loadAdditionalLicenses,
} from "../scripts/lib/prepare.mjs";
import { buildCatalog } from "../scripts/lib/build.mjs";
import {
  contentDigest,
  inspectSkill,
  LIMITS,
} from "../scripts/lib/package.mjs";
import { sha256 } from "../scripts/lib/common.mjs";

const licenseBytes = Buffer.from(
  "Test-only copyright © fixture\r\nLicense notice\r\n",
);
const licensePath = `LICENSES/${sha256(licenseBytes)}.txt`;

function reviewInput(sourceFiles = [], evidencePaths = ["LICENSE"]) {
  const candidate = makeCandidate("alpha");
  candidate.files.push(...sourceFiles);
  const source = candidate.skill.source;
  const contents = new Map([
    ["LICENSE", licenseBytes],
    ["COPYING", licenseBytes],
    ...candidate.files.map((file) => [
      `${source.path}/${file.path}`,
      file.bytes,
    ]),
  ]);
  const snapshot = {
    files: [...contents].map(([path, bytes]) => ({
      path,
      size: bytes.length,
      mode: "100644",
    })),
    read: (paths) => new Map(paths.map((path) => [path, contents.get(path)])),
  };
  const review = {
    sourceCommit: source.commit,
    contentSha256: contentDigest(candidate.files),
    reviewedBy: "Test-only reviewer",
    reviewedOn: "2026-09-12",
    licenseExpression: "MIT",
    licenseFiles: evidencePaths.map((path) => ({
      path,
      sha256: sha256(contents.get(path)),
    })),
  };
  const licenseCopies = new Map();
  const authors = [
    {
      name: "Independent fixture author",
      url: "https://authors.example/profile",
    },
  ];
  const prepare = () =>
    prepareCandidates(
      {
        entries: [
          {
            id: "alpha",
            version: "1.0.0",
            source,
            description: "Test-only fixture",
            authors,
            category: "Other",
            declaredLicense: "MIT",
            issues: [],
          },
        ],
      },
      { "alpha@1.0.0": review },
      {
        publisher: {
          id: "aipoch",
          name: "AIPOCH",
          url: "https://aipoch.com/agent-skills",
        },
      },
      snapshot,
      licenseCopies,
    )[0];
  return { candidate, contents, review, prepare, licenseCopies, authors };
}

test("external license bytes survive preparation and ZIP distribution with complete package metrics", () => {
  const input = reviewInput([
    { path: "raw_report.json", bytes: Buffer.from('{"maxScore":100}\r\n') },
  ]);
  const prepared = input.prepare();
  assert.deepEqual(
    prepared.files.slice(0, input.candidate.files.length),
    input.candidate.files.map((file) => ({ ...file, mode: "100644" })),
  );
  assert.deepEqual(prepared.files.at(-1), {
    path: licensePath,
    mode: "100644",
    bytes: licenseBytes,
  });
  assert.equal(
    input.review.contentSha256,
    contentDigest(input.candidate.files),
  );
  assert.notEqual(contentDigest(prepared.files), input.review.contentSha256);
  const built = buildCatalog([prepared]);
  const descriptor = JSON.parse(built.objects.get("releases/alpha/1.0.0.json"));
  const archive = built.objects.get(descriptor.artifact.path);
  const extracted = unzipSync(archive);
  assert.deepEqual(
    Object.keys(extracted).sort(),
    prepared.files.map((file) => `alpha/${file.path}`).sort(),
  );
  for (const file of prepared.files)
    assert.deepEqual(Buffer.from(extracted[`alpha/${file.path}`]), file.bytes);
  assert.equal(
    descriptor.package.content_sha256,
    contentDigest(prepared.files),
  );
  assert.equal(descriptor.package.file_count, prepared.files.length);
  assert.equal(
    descriptor.package.uncompressed_bytes,
    prepared.files.reduce((n, file) => n + file.bytes.length, 0),
  );
  assert.equal(descriptor.artifact.sha256, sha256(archive));
  assert.equal(
    descriptor.skill.license.evidence[0].sha256,
    sha256(Buffer.from(extracted[`alpha/${licensePath}`])),
  );
  assert.ok(descriptor.skill.license.evidence[0].url.endsWith("/LICENSE"));
  assert.deepEqual(buildCatalog([input.prepare()]).rootBytes, built.rootBytes);
});

test("local evidence stays in place and identical external evidence is bundled only once after verification", () => {
  const local = reviewInput(
    [{ path: "LICENSE", bytes: licenseBytes }],
    ["skills/alpha/LICENSE"],
  );
  assert.deepEqual(
    local.prepare().files.map((file) => file.path),
    ["SKILL.md", "LICENSE"],
  );
  const duplicate = reviewInput([], ["LICENSE", "COPYING"]);
  const prepared = duplicate.prepare();
  assert.equal(prepared.files.length, 2);
  assert.equal(prepared.skill.license.evidence.length, 2);
  duplicate.contents.set("COPYING", Buffer.from("tampered duplicate evidence"));
  assert.throws(duplicate.prepare, /license evidence changed/);
});

test("generated license paths cannot overwrite or conflict with reviewed source files", () => {
  for (const path of [
    licensePath,
    licensePath.toLowerCase(),
    "LICENSES",
    `${licensePath}/child.txt`,
  ]) {
    const input = reviewInput([{ path, bytes: licenseBytes }]);
    assert.throws(
      input.prepare,
      /duplicate or case-colliding|file\/directory path conflict/,
    );
    assert.equal(
      input.review.contentSha256,
      contentDigest(input.candidate.files),
    );
  }
});

test("license files count toward package limits and never waive missing review", () => {
  const extra = Array.from({ length: LIMITS.maxFiles - 1 }, (_, index) => ({
    path: `references/${index}.txt`,
    bytes: Buffer.alloc(0),
  }));
  const input = reviewInput(extra);
  assert.equal(
    inspectSkill({ id: "alpha", files: input.candidate.files }).fileCount,
    LIMITS.maxFiles,
  );
  assert.throws(input.prepare, /file count exceeds limit/);
  input.review.reviewedBy = "";
  assert.throws(
    input.prepare,
    (error) => error.blockers?.[0]?.code === "missing-review",
  );
});

const originalNotice = Buffer.from(
  "Third-party fixture copyright © original\r\nMIT fixture notice\r\n",
);
const originalEvidence = {
  source: {
    repository: "https://github.com/independent-author/original-skills",
    commit: "b".repeat(40),
    path: "LICENSE.md",
  },
  sha256: sha256(originalNotice),
};

test("third-party notices and authors survive listing, detail, ZIP and incremental history", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "skill-license-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, `${originalEvidence.sha256}.txt`),
    originalNotice,
  );
  const input = reviewInput();
  const previous = buildCatalog([input.prepare()]);
  const oldSkillBytes = Buffer.from(input.candidate.files[0].bytes);
  input.review.additionalLicenseFiles = [originalEvidence, originalEvidence];
  const loaded = await loadAdditionalLicenses([input.review], directory);
  for (const [hash, bytes] of loaded) input.licenseCopies.set(hash, bytes);
  const prepared = input.prepare();
  const built = buildCatalog([prepared]);
  const listing = built.root.skills[0];
  const detail = JSON.parse(built.objects.get(listing.release.path));
  assert.deepEqual(toAppEntry(listing), toAppEntry(detail.skill));
  assert.deepEqual(toAppEntry(listing).authors, input.authors);
  assert.equal(toAppEntry(listing).publisher.name, "AIPOCH");
  assert.deepEqual(listing.source, input.candidate.skill.source);
  assert.deepEqual(detail.skill.license.evidence.at(-1), {
    url: `${originalEvidence.source.repository}/blob/${originalEvidence.source.commit}/LICENSE.md`,
    sha256: originalEvidence.sha256,
  });
  const zip = unzipSync(built.objects.get(detail.artifact.path));
  assert.deepEqual(
    Buffer.from(zip[`alpha/LICENSES/${originalEvidence.sha256}.txt`]),
    originalNotice,
  );
  assert.deepEqual(Buffer.from(zip["alpha/SKILL.md"]), oldSkillBytes);
  assert.equal(prepared.files.length, input.candidate.files.length + 2);
  assert.throws(
    () =>
      buildCatalog([prepared], {
        history: previous.objects,
        previousRoot: previous.root,
      }),
    /immutable/,
  );
  const added = makeCandidate("new-third-party");
  added.skill.authors = input.authors;
  const increment = buildCatalog([prepared, added], {
    history: built.objects,
    previousRoot: built.root,
  });
  for (const [path, bytes] of built.objects) {
    if (path.startsWith("releases/") || path.startsWith("shards/"))
      assert.deepEqual(increment.objects.get(path), bytes, path);
  }
});

test("supplemental copies fail closed for missing, changed, unsafe and special files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "skill-license-invalid-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = reviewInput();
  input.review.additionalLicenseFiles = [originalEvidence];
  const path = join(directory, `${originalEvidence.sha256}.txt`);
  assert.throws(input.prepare, /missing or changed/);
  await assert.rejects(
    loadAdditionalLicenses([input.review], directory),
    /ENOENT/,
  );
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from("tampered"),
    Buffer.alloc(4 * 1024 * 1024 + 1),
  ]) {
    await writeFile(path, bytes);
    await assert.rejects(
      loadAdditionalLicenses([input.review], directory),
      /nonempty bounded|changed/,
    );
  }
  await rm(path);
  await mkdir(path);
  await assert.rejects(
    loadAdditionalLicenses([input.review], directory),
    /regular file/,
  );
  await rm(path, { recursive: true });
  const target = join(directory, "original.txt");
  await writeFile(target, originalNotice);
  // Directory junctions need no Windows symlink privilege; file symlinks are also checked on POSIX.
  const linkedDirectory = join(directory, "linked");
  await symlink(
    directory,
    linkedDirectory,
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(
    loadAdditionalLicenses([input.review], linkedDirectory),
    /regular directory/,
  );
  if (process.platform !== "win32") {
    await symlink(target, path);
    await assert.rejects(
      loadAdditionalLicenses([input.review], directory),
      /regular file/,
    );
  }
  for (const record of [
    null,
    { ...originalEvidence, sha256: "../escape" },
    { ...originalEvidence, path: "arbitrary-local.txt" },
    {
      ...originalEvidence,
      source: { ...originalEvidence.source, commit: "main" },
    },
    {
      ...originalEvidence,
      source: {
        ...originalEvidence.source,
        repository: "https://example.com/repo",
      },
    },
    {
      ...originalEvidence,
      source: { ...originalEvidence.source, path: "../LICENSE" },
    },
    {
      ...originalEvidence,
      source: {
        repository: originalEvidence.source.repository,
        commit: originalEvidence.source.commit,
      },
    },
  ]) {
    input.review.additionalLicenseFiles = [record];
    await assert.rejects(
      loadAdditionalLicenses([input.review], directory),
      /invalid|unsafe|immutable/,
    );
    assert.throws(input.prepare, /invalid|unsafe|immutable/);
  }
  input.review.additionalLicenseFiles = null;
  assert.throws(input.prepare, /must be an array/);
});

test("supplemental notices share deduplication and collision gates with source evidence", () => {
  const input = reviewInput();
  input.review.additionalLicenseFiles = [
    { ...originalEvidence, sha256: sha256(licenseBytes) },
  ];
  input.licenseCopies.set(sha256(licenseBytes), licenseBytes);
  assert.equal(input.prepare().files.length, 2);
  input.licenseCopies.set(
    sha256(licenseBytes),
    Buffer.from("tampered duplicate"),
  );
  assert.throws(input.prepare, /missing or changed/);
  const collision = reviewInput([
    { path: `LICENSES/${originalEvidence.sha256}.txt`, bytes: originalNotice },
  ]);
  collision.review.additionalLicenseFiles = [originalEvidence];
  collision.licenseCopies.set(originalEvidence.sha256, originalNotice);
  assert.throws(collision.prepare, /duplicate or case-colliding/);
});
