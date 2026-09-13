import { parseMetadataJson, metadataJsonBytes } from "./metadata-json.mjs";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Ajv from "ajv";
import { assertPath, assertSource, sha256 } from "./common.mjs";
import { gitSnapshot } from "./source.mjs";
import { inspectSkill, LIMITS } from "./package.mjs";
import { inspectFrontmatter } from "./catalog.mjs";
import { prepareCandidates } from "./prepare.mjs";

const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addFormat("safe-path", (value) => {
  try {
    assertPath(value);
    return true;
  } catch {
    return false;
  }
});
ajv.addSchema(
  JSON.parse(
    readFileSync(
      new URL("../../protocol/schemas/common.schema.json", import.meta.url),
    ),
  ),
);
const validate = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL("../../authoring/release.config.schema.json", import.meta.url),
    ),
  ),
);

export function parseReleaseConfig(bytes) {
  const manifest = JSON.parse(bytes);
  if (!validate(manifest))
    throw new Error(
      `invalid release.config.json: ${ajv.errorsText(validate.errors)}`,
    );
  assertSource(manifest.source);
  return parseMetadataJson(bytes);
}

export function validateReleaseConfig(manifest) {
  parseReleaseConfig(metadataJsonBytes(manifest));
  return manifest;
}

// The local clone is operator-supplied. Check its origin to catch wrong-clone
// mistakes; this is not proof of ownership or redistribution permission.
export function submissionSnapshot(repository, manifest) {
  validateReleaseConfig(manifest);
  const origin = execFileSync(
    "git",
    ["-C", repository, "remote", "get-url", "origin"],
    { encoding: "utf8" },
  ).trim();
  const normalized = origin
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/\.git$/, "");
  if (normalized !== manifest.source.repository.replace(/\.git$/, ""))
    throw new Error(
      "local clone origin does not match manifest source repository",
    );
  return gitSnapshot(repository, manifest.source.commit);
}

export function inspectSubmission(manifest, snapshot) {
  validateReleaseConfig(manifest);
  const prefix = manifest.source.path + "/";
  const selected = snapshot.files.filter((file) =>
    file.path.startsWith(prefix),
  );
  if (
    selected.length > LIMITS.maxFiles ||
    selected.some(
      (file) =>
        !["100644", "100755"].includes(file.mode) ||
        file.size > LIMITS.maxFileBytes,
    ) ||
    selected.reduce((sum, file) => sum + file.size, 0) > LIMITS.maxSkillBytes
  )
    throw new Error(
      "source package exceeds resource limits or contains special files",
    );
  const contents = snapshot.read(selected.map((file) => file.path));
  const files = selected.map((file) => ({
    path: file.path.slice(prefix.length),
    mode: file.mode,
    bytes: contents.get(file.path),
  }));
  const metrics = inspectSkill({ id: manifest.id, files });
  const { data } = inspectFrontmatter(
    contents.get(prefix + "SKILL.md").toString(),
  );
  const license = data.license ?? data.metadata?.license;
  if (typeof license !== "string" || !license.trim() || license.length > 500)
    throw new Error(
      "SKILL.md requires a per-Skill license declaration (at most 500 characters)",
    );
  if (data.description.length > 10000)
    throw new Error("SKILL.md description exceeds protocol limit");
  const author =
    data.author ?? data.metadata?.author ?? data.metadata?.["skill-author"];
  if (typeof author === "string" && author.length > 500)
    throw new Error("SKILL.md author exceeds protocol limit");
  const licenseFiles = manifest.licenseFiles.map((path) => {
    const file = snapshot.files.find((file) => file.path === path);
    if (
      !file ||
      !["100644", "100755"].includes(file.mode) ||
      file.size > 4 * 1024 * 1024 ||
      file.size === 0
    )
      throw new Error(
        "license evidence must be a nonempty bounded regular file",
      );
    return { path, sha256: sha256(snapshot.read([path]).get(path)) };
  });
  return {
    entry: {
      id: manifest.id,
      version: manifest.version,
      displayName: manifest.displayName ?? manifest.id,
      category: manifest.category,
      source: manifest.source,
      description: data.description,
      declaredLicense: license,
      ...(typeof author === "string" && author.trim()
        ? { authors: [{ name: author }] }
        : {}),
      issues: [],
    },
    reviewInput: {
      sourceRepository: manifest.source.repository,
      sourceCommit: manifest.source.commit,
      sourcePath: manifest.source.path,
      // Bind the authored metadata as well as payload/evidence bytes to review.
      manifestSha256: sha256(metadataJsonBytes(manifest)),
      contentSha256: metrics.contentSha256,
      fileCount: metrics.fileCount,
      totalBytes: metrics.totalBytes,
      licenseExpression: license,
      licenseFiles,
    },
  };
}

export function prepareSubmission(manifest, snapshot, reviews, config) {
  const { entry, reviewInput } = inspectSubmission(manifest, snapshot);
  const key = `${manifest.id}@${manifest.version}`;
  const review = reviews[key];
  if (!review) throw new Error(`missing maintainer review: ${key}`);
  if (Object.hasOwn(review, "additionalLicenseFiles"))
    throw new Error(
      "provider intake does not support additional license copies; include required notices in the submitted source",
    );
  for (const field of ["sourceRepository", "sourcePath", "manifestSha256"])
    if (review[field] !== reviewInput[field])
      throw new Error(`reviewed submission metadata changed: ${field}`);
  if (
    !Array.isArray(review.licenseFiles) ||
    review.licenseFiles.length !== reviewInput.licenseFiles.length ||
    reviewInput.licenseFiles.some(
      (file, index) =>
        file.path !== review.licenseFiles[index]?.path ||
        file.sha256 !== review.licenseFiles[index]?.sha256,
    )
  )
    throw new Error("reviewed license files differ from submission");
  return prepareCandidates({ entries: [entry] }, reviews, config, snapshot)[0];
}
