import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { assertPath, utf8Compare } from "./common.mjs";
import { parseReleaseConfig, submissionKey } from "./authoring.mjs";

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

export function validateSubmissionIndex(index) {
  if (!validate(index))
    throw new Error(
      `invalid submission index: ${ajv.errorsText(validate.errors)}`,
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
    if (keys.has(record.submission_key))
      throw new Error(`duplicate submission key: ${record.submission_key}`);
    keys.add(record.submission_key);
    ids.add(record.skill_id);
    const provider = providerById.get(record.provider_id);
    if (!provider) throw new Error(`unknown provider: ${record.provider_id}`);
    const manifest = parseReleaseConfig(
      readFileSync(new URL(`../../${record.release_config}`, import.meta.url)),
    );
    if (submissionKey(manifest) !== record.submission_key)
      throw new Error(
        `submission key does not match release config: ${record.submission_key}`,
      );
    if (
      manifest.id !== record.skill_id ||
      manifest.provider?.id !== record.provider_id
    )
      throw new Error(
        `submission identity does not match release config: ${record.submission_key}`,
      );
    if (
      manifest.provider.name !== provider.name ||
      manifest.provider.url !== provider.url ||
      manifest.source.repository !== provider.repository ||
      manifest.source.commit !== provider.commit
    )
      throw new Error(`provider/source mismatch: ${record.submission_key}`);
    if ((record.state === "blocked") !== record.blockers.length > 0)
      throw new Error(
        `submission state does not match blockers: ${record.submission_key}`,
      );
    providerCounts.set(
      record.provider_id,
      (providerCounts.get(record.provider_id) ?? 0) + 1,
    );
  }
  const count = (field, value) =>
    index.submissions.filter((record) => record[field].includes(value)).length;
  const expected = {
    record_count: index.submissions.length,
    provider_count: index.providers.length,
    unique_skill_ids: ids.size,
    pending_review: index.submissions.filter(
      (record) => record.state === "pending-review",
    ).length,
    blocked: index.submissions.filter((record) => record.state === "blocked")
      .length,
    runtime_id_collisions: count(
      "publication_constraints",
      "runtime-id-collision",
    ),
    missing_skill_licenses: count("blockers", "missing-skill-license"),
    license_policy_reviews: count("review_flags", "license-policy-exception"),
  };
  if (JSON.stringify(index.summary) !== JSON.stringify(expected))
    throw new Error("submission summary does not match indexed records");
  for (const provider of index.providers)
    if (provider.record_count !== providerCounts.get(provider.id))
      throw new Error(
        `provider count does not match submissions: ${provider.id}`,
      );
  const sorted = [...index.submissions].sort((a, b) =>
    utf8Compare(a.submission_key, b.submission_key),
  );
  if (JSON.stringify(index.submissions) !== JSON.stringify(sorted))
    throw new Error("submission index must be sorted by submission_key");
  return index;
}
