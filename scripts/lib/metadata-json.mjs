import { jsonBytes } from "./common.mjs";

// Repository-owned metadata only. Never transform protocol/signature bytes,
// JSON Schema keywords, package manifests or upstream payloads with this codec.
// Explicit field names preserve dictionary keys such as example@1.0.0-RC.1.
const fields = [
  "auditCount",
  "uploadedReports",
  "reusedReports",
  "sourceArchiveName",
  "sourceArchiveSha256",
  "excludedIds",
  "reportSha256",
  "reportArchivePath",
  "catalogRevision",
  "reportCount",
  "identityReviews",
  "reviewState",
  "reviewNotes",
  "materialSkillPath",
  "materialSkillSha256",
  "reportPath",
  "reportSkillName",
  "identityReviewRequired",
  "recordKey",
  "resumeConditions",
  "publicationStatus",
  "schemaVersion",
  "selectionInput",
  "archiveName",
  "archiveSha256",
  "recordCount",
  "providerCount",
  "uniqueSkillIds",
  "pendingReview",
  "runtimeIdCollisions",
  "missingSkillLicenses",
  "licensePolicyReviews",
  "submissionKey",
  "skillId",
  "providerId",
  "releaseConfig",
  "publicationConstraints",
  "reviewFlags",
  "initialVersion",
  "authoritySha256",
  "displayName",
  "sourceRepository",
  "sourceCommit",
  "sourcePath",
  "manifestSha256",
  "contentSha256",
  "licenseExpression",
  "packageLicenseExpression",
  "licenseFiles",
  "additionalLicenseFiles",
  "reviewedBy",
  "reviewedOn",
  "exceptionReason",
  "omitEvaluationReason",
  "declaredLicense",
  "memberCount",
  "fileCount",
  "totalBytes",
  "fixtureOnly",
  "baseRevision",
  "rootSha256",
  "cdnObjects",
  "reusedObjects",
  "affectedMembers",
  "maxScore",
  "reportUrl",
  "staticScore",
  "dynamicScore",
  "evaluatedOn",
  "evaluatorVersion",
  "skillVersion",
  "evaluationReportPath",
  "evaluationReportSha256",
];
const toSnake = new Map(
  fields.map((key) => [
    key,
    key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase()),
  ]),
);
const toCamel = new Map([...toSnake].map(([camel, snake]) => [snake, camel]));

function mapFields(value, names, rejected) {
  if (Array.isArray(value))
    return value.map((item) => mapFields(item, names, rejected));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (rejected.has(key))
        throw new Error(
          `invalid metadata field ${key}; expected ${rejected.get(key)}`,
        );
      return [names.get(key) ?? key, mapFields(item, names, rejected)];
    }),
  );
}

export function parseMetadataJson(bytes) {
  return mapFields(JSON.parse(bytes), toCamel, toSnake);
}

export function metadataJsonBytes(value) {
  return jsonBytes(mapFields(value, toSnake, toCamel));
}
