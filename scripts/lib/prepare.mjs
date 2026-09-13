import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertPath, assertSource, sha256 } from "./common.mjs";
import { contentDigest, inspectSkill } from "./package.mjs";
import { evaluationToWire } from "./protocol.mjs";
import { sourceUrl } from "./catalog.mjs";

function additionalLicenseFiles(review) {
  if (!Object.hasOwn(review, "additionalLicenseFiles")) return [];
  if (!Array.isArray(review.additionalLicenseFiles))
    throw new Error("additional license files must be an array");
  for (const file of review.additionalLicenseFiles) {
    if (
      !file ||
      Object.keys(file).some((key) => !["source", "sha256"].includes(key)) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !file.source ||
      Object.keys(file.source).some(
        (key) => !["repository", "commit", "path"].includes(key),
      )
    )
      throw new Error("invalid additional license evidence");
    assertSource(file.source);
    assertPath(file.source.path);
  }
  return review.additionalLicenseFiles;
}

// Copies are reviewed repository inputs, never fetched from the network at build time.
export async function loadAdditionalLicenses(reviews, directory) {
  const copies = new Map();
  for (const review of reviews) {
    for (const file of additionalLicenseFiles(review ?? {})) {
      if (copies.has(file.sha256)) continue;
      const folder = await lstat(directory);
      if (!folder.isDirectory() || folder.isSymbolicLink())
        throw new Error("license copy directory must be a regular directory");
      const path = join(directory, `${file.sha256}.txt`);
      const stat = await lstat(path);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        !stat.size ||
        stat.size > 4 * 1024 * 1024
      )
        throw new Error("license copy must be a nonempty bounded regular file");
      const bytes = await readFile(path);
      if (
        !bytes.length ||
        bytes.length > 4 * 1024 * 1024 ||
        sha256(bytes) !== file.sha256
      )
        throw new Error(`additional license evidence changed: ${file.sha256}`);
      copies.set(file.sha256, bytes);
    }
  }
  return copies;
}

export function prepareCandidates(
  audit,
  reviews,
  config,
  snapshot,
  licenseCopies = new Map(),
) {
  const blockers = [];
  for (const entry of audit.entries) {
    const review =
      reviews[`${entry.id}@${entry.version ?? config.initialVersion}`];
    const omitEvaluation =
      typeof review?.omitEvaluationReason === "string" &&
      review.omitEvaluationReason.trim();
    for (const issue of entry.issues) {
      if (
        omitEvaluation &&
        ["invalid-evaluation", "ambiguous-evaluation"].includes(issue.code)
      )
        continue;
      blockers.push({ id: entry.id, ...issue });
    }
    if (!review?.reviewedBy?.trim())
      blockers.push({
        id: entry.id,
        code: "missing-review",
        detail:
          "Exact package bytes and redistribution evidence require review",
      });
  }
  if (blockers.length) {
    const error = new Error(
      `publication blocked: ${blockers.length} findings across ${new Set(blockers.map((b) => b.id)).size} members`,
    );
    error.blockers = blockers;
    throw error;
  }
  return audit.entries.map((entry) => {
    const review =
      reviews[`${entry.id}@${entry.version ?? config.initialVersion}`];
    if (
      review.sourceCommit !== entry.source.commit ||
      !review.reviewedBy?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedOn) ||
      !Array.isArray(review.licenseFiles) ||
      !review.licenseFiles.length
    )
      throw new Error(`invalid reviewed evidence: ${entry.id}`);
    if (review.licenseExpression !== entry.declaredLicense)
      throw new Error(`license declaration differs from review: ${entry.id}`);
    if (
      ![
        "MIT",
        "Apache-2.0",
        "BSD-2-Clause",
        "BSD-3-Clause",
        "ISC",
        "CC0-1.0",
      ].includes(review.licenseExpression) &&
      !review.exceptionReason?.trim()
    )
      throw new Error(
        `license requires an explicit policy exception: ${entry.id}`,
      );
    const inputFiles = snapshot.files.filter((f) =>
      f.path.startsWith(entry.source.path + "/"),
    );
    const content = snapshot.read(inputFiles.map((f) => f.path));
    const files = inputFiles.map((f) => ({
      path: f.path.slice(entry.source.path.length + 1),
      mode: f.mode,
      bytes: content.get(f.path),
    }));
    if (contentDigest(files) !== review.contentSha256)
      throw new Error(`reviewed package bytes changed: ${entry.id}`);
    const bundledEvidence = new Set();
    const evidence = review.licenseFiles.map((file) => {
      assertPath(file.path);
      const evidenceFile = snapshot.files.find((f) => f.path === file.path);
      if (
        !evidenceFile ||
        !["100644", "100755"].includes(evidenceFile.mode) ||
        evidenceFile.size > 4 * 1024 * 1024
      )
        throw new Error("license evidence must be a bounded regular file");
      const bytes = snapshot.read([file.path]).get(file.path);
      if (sha256(bytes) !== file.sha256)
        throw new Error(`license evidence changed: ${file.path}`);
      if (
        !file.path.startsWith(entry.source.path + "/") &&
        !bundledEvidence.has(file.sha256)
      ) {
        files.push({
          path: `LICENSES/${file.sha256}.txt`,
          mode: "100644",
          bytes,
        });
        bundledEvidence.add(file.sha256);
      }
      return { url: sourceUrl(entry.source, file.path), sha256: file.sha256 };
    });
    for (const file of additionalLicenseFiles(review)) {
      const bytes = licenseCopies.get(file.sha256);
      if (
        !Buffer.isBuffer(bytes) ||
        !bytes.length ||
        bytes.length > 4 * 1024 * 1024 ||
        sha256(bytes) !== file.sha256
      )
        throw new Error(
          `missing or changed additional license evidence: ${file.sha256}`,
        );
      if (!bundledEvidence.has(file.sha256)) {
        files.push({
          path: `LICENSES/${file.sha256}.txt`,
          mode: "100644",
          bytes,
        });
        bundledEvidence.add(file.sha256);
      }
      evidence.push({
        url: sourceUrl(file.source, file.source.path),
        sha256: file.sha256,
      });
    }
    inspectSkill({ id: entry.id, files });
    const evaluation = review.omitEvaluationReason?.trim()
      ? undefined
      : evaluationToWire(entry.evaluation);
    return {
      skill: {
        id: entry.id,
        version: entry.version ?? config.initialVersion,
        display_name: entry.displayName ?? entry.id,
        summary: entry.description,
        category: entry.category,
        source: entry.source,
        publisher: config.publisher,
        ...(entry.authors ? { authors: entry.authors } : {}),
        license: {
          expression: review.licenseExpression,
          evidence,
          review: {
            reviewed_by: review.reviewedBy,
            reviewed_on: review.reviewedOn,
            ...(review.exceptionReason
              ? { exception_reason: review.exceptionReason }
              : {}),
          },
        },
        ...(evaluation ? { evaluation } : {}),
      },
      files,
    };
  });
}
