import { readFileSync } from "node:fs";
import { parseMetadataJson } from "./metadata-json.mjs";
import Ajv from "ajv";
import { assertPath, utf8Compare } from "./common.mjs";
import { parseReleaseConfig } from "./authoring.mjs";

const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addFormat("safe-path", (value) => {
  try {
    assertPath(value);
    return true;
  } catch {
    return false;
  }
});
ajv.addFormat("https-url", (value) => {
  try {
    return new URL(value).protocol === "https:";
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
      new URL("../../authoring/submission-index.schema.json", import.meta.url),
    ),
  ),
);

export function parseSubmissionIndex(bytes, authority, production) {
  if (!validate(JSON.parse(bytes)))
    throw new Error(
      `invalid submission index: ${ajv.errorsText(validate.errors)}`,
    );
  const index = parseMetadataJson(bytes);
  const occupiedIds = new Set(
    [...authority, ...production].map((entry) => entry.id),
  );
  const providerById = new Map(
    index.providers.map((provider) => [provider.id, provider]),
  );
  if (providerById.size !== index.providers.length)
    throw new Error("duplicate provider identity in submission index");
  const keys = new Set();
  const ids = new Set();
  const providerCounts = new Map();
  for (const record of index.submissions) {
    if (keys.has(record.submissionKey))
      throw new Error(`duplicate submission key: ${record.submissionKey}`);
    keys.add(record.submissionKey);
    ids.add(record.skillId);
    const provider = providerById.get(record.providerId);
    if (!provider) throw new Error(`unknown provider: ${record.providerId}`);
    const manifest = parseReleaseConfig(
      readFileSync(new URL(`../../${record.releaseConfig}`, import.meta.url)),
    );
    if (
      `${provider.id}/${manifest.id}@${manifest.version}` !==
      record.submissionKey
    )
      throw new Error(
        `submission key does not match release config: ${record.submissionKey}`,
      );
    if (manifest.id !== record.skillId)
      throw new Error(
        `submission identity does not match release config: ${record.submissionKey}`,
      );
    if (
      manifest.source.repository !== provider.repository ||
      manifest.source.commit !== provider.commit
    )
      throw new Error(`provider/source mismatch: ${record.submissionKey}`);
    if (
      record.publicationConstraints.includes("runtime-id-collision") !==
      occupiedIds.has(manifest.id)
    )
      throw new Error(
        `runtime ID collision does not match catalog: ${record.submissionKey}`,
      );
    if ((record.state === "blocked") !== record.blockers.length > 0)
      throw new Error(
        `submission state does not match blockers: ${record.submissionKey}`,
      );
    providerCounts.set(
      record.providerId,
      (providerCounts.get(record.providerId) ?? 0) + 1,
    );
  }
  const count = (field, value) =>
    index.submissions.filter((record) => record[field].includes(value)).length;
  const expected = {
    recordCount: index.submissions.length,
    providerCount: index.providers.length,
    uniqueSkillIds: ids.size,
    pendingReview: index.submissions.filter(
      (record) => record.state === "pending-review",
    ).length,
    blocked: index.submissions.filter((record) => record.state === "blocked")
      .length,
    runtimeIdCollisions: count(
      "publicationConstraints",
      "runtime-id-collision",
    ),
    missingSkillLicenses: count("blockers", "missing-skill-license"),
    licensePolicyReviews: count("reviewFlags", "license-policy-exception"),
  };
  if (
    Object.entries(expected).some(
      ([field, count]) => index.summary[field] !== count,
    )
  )
    throw new Error("submission summary does not match indexed records");
  for (const provider of index.providers)
    if (provider.recordCount !== providerCounts.get(provider.id))
      throw new Error(
        `provider count does not match submissions: ${provider.id}`,
      );
  const sorted = [...index.submissions].sort((a, b) =>
    utf8Compare(a.submissionKey, b.submissionKey),
  );
  if (JSON.stringify(index.submissions) !== JSON.stringify(sorted))
    throw new Error("submission index must be sorted by submission_key");
  return index;
}
