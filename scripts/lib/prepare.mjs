import { assertPath, sha256 } from "./common.mjs";
import { contentDigest } from "./package.mjs";
import { evaluationToWire } from "./protocol.mjs";
import { sourceUrl } from "./catalog.mjs";

export function prepareCandidates(audit, reviews, config, snapshot) {
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
    if (!review)
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
      return { url: sourceUrl(entry.source, file.path), sha256: file.sha256 };
    });
    const evaluation = review.omitEvaluationReason?.trim()
      ? undefined
      : evaluationToWire(entry.evaluation);
    return {
      skill: {
        id: entry.id,
        version: entry.version ?? config.initialVersion,
        display_name: entry.id,
        summary: entry.description,
        category: entry.category,
        inclusion_tier: entry.inclusionTier,
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
