import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsonBytes, sha256, assertSource, assertPath } from "./common.mjs";
import { metadataJsonBytes, parseMetadataJson } from "./metadata-json.mjs";
import { signRoot, verifyRoot } from "./signing.mjs";

const isHash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxEnvelopeBytes = 8 * 1024 * 1024;
export const auditIdentity = (entry) =>
  JSON.stringify([
    entry.id,
    entry.version,
    entry.source.repository,
    entry.source.commit,
    entry.source.path,
    entry.contentSha256,
  ]);

function shape(value, required, optional = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    throw new Error("Invalid audit fields");
}
function scorePair(score, maxScore) {
  if (
    !Number.isFinite(score) ||
    !Number.isFinite(maxScore) ||
    score < 0 ||
    maxScore <= 0 ||
    score > maxScore
  )
    throw new Error("Invalid audit score");
  return { score, maxScore };
}
function validateEvaluation(evaluation) {
  shape(
    evaluation,
    [
      "kind",
      "auditor",
      "scope",
      "score",
      "maxScore",
      "evaluatedOn",
      "evaluatorVersion",
    ],
    ["staticScore", "dynamicScore"],
  );
  if (
    evaluation.kind !== "aipoch-audit" ||
    evaluation.auditor !== "AIPOCH" ||
    evaluation.scope !== "submitted-material" ||
    typeof evaluation.evaluatorVersion !== "string" ||
    !/^skill-auditor@\S.{0,180}$/.test(evaluation.evaluatorVersion)
  )
    throw new Error("Missing skill-auditor identity");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(evaluation.evaluatedOn) ||
    !Number.isFinite(Date.parse(evaluation.evaluatedOn)) ||
    new Date(evaluation.evaluatedOn).toISOString().slice(0, 10) !==
      evaluation.evaluatedOn
  )
    throw new Error("Invalid audit date");
  scorePair(evaluation.score, evaluation.maxScore);
  for (const key of ["staticScore", "dynamicScore"])
    if (Object.hasOwn(evaluation, key)) {
      shape(evaluation[key], ["score", "maxScore"]);
      scorePair(evaluation[key].score, evaluation[key].maxScore);
    }
  return evaluation;
}
// Upstream report keys are read at this boundary; the original bytes are never rewritten.
export function reportEvaluation(report) {
  const meta = report.meta;
  if (!meta || typeof meta.skill_name !== "string")
    throw new Error("Missing skill-auditor identity");
  return validateEvaluation({
    kind: "aipoch-audit",
    auditor: "AIPOCH",
    scope: "submitted-material",
    ...scorePair(report.final?.score, report.final?.max),
    evaluatedOn: meta.evaluated_on,
    evaluatorVersion: meta.evaluator_version,
    ...(report.static_score
      ? {
          staticScore: scorePair(
            report.static_score.subtotal,
            report.static_score.max,
          ),
        }
      : {}),
    ...(report.dynamic_score
      ? {
          dynamicScore: scorePair(
            report.dynamic_score.execution_avg,
            report.dynamic_score.max,
          ),
        }
      : {}),
  });
}
export const archiveSkillPrefix = (source) =>
  `skills/${source.repository.replace("https://github.com/", "").replace("/", "__")}/${source.path}`;
function validateEntries(entries, evaluated) {
  if (!Array.isArray(entries) || entries.length > 10000)
    throw new Error("Invalid audit entries");
  const seen = new Set();
  for (const record of entries) {
    shape(record, [
      "id",
      "version",
      "source",
      "contentSha256",
      "reportSha256",
      "reportArchivePath",
      ...(evaluated ? ["evaluation"] : []),
    ]);
    shape(record.source, ["repository", "commit", "path"]);
    if (
      typeof record.source.repository !== "string" ||
      typeof record.source.commit !== "string"
    )
      throw new Error("Invalid audit source");
    assertSource(record.source);
    if (
      typeof record.id !== "string" ||
      record.id.length > 128 ||
      !idPattern.test(record.id) ||
      typeof record.version !== "string" ||
      record.version.length > 128 ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        record.version,
      ) ||
      !isHash(record.reportSha256) ||
      !isHash(record.contentSha256)
    )
      throw new Error("Invalid audit identity or digest");
    const key = auditIdentity(record);
    if (seen.has(key)) throw new Error("Duplicate audit identity");
    seen.add(key);
    assertPath(record.reportArchivePath);
    const prefix = archiveSkillPrefix(record.source) + "/";
    if (
      !record.reportArchivePath.startsWith(prefix) ||
      record.reportArchivePath.slice(prefix.length).includes("/") ||
      !record.reportArchivePath.endsWith(".json")
    )
      throw new Error("Audit material path mismatch");
    if (evaluated) validateEvaluation(record.evaluation);
  }
}
export function parseAuditRegistry(bytes) {
  const input = parseMetadataJson(bytes);
  shape(input, [
    "schemaVersion",
    "sourceArchiveName",
    "sourceArchiveSha256",
    "excludedIds",
    "entries",
  ]);
  if (
    input.schemaVersion !== 1 ||
    !isHash(input.sourceArchiveSha256) ||
    typeof input.sourceArchiveName !== "string" ||
    !input.sourceArchiveName ||
    !Array.isArray(input.excludedIds) ||
    input.excludedIds.some(
      (id) => typeof id !== "string" || !idPattern.test(id),
    ) ||
    new Set(input.excludedIds).size !== input.excludedIds.length
  )
    throw new Error("Invalid audit registry");
  validateEntries(input.entries, false);
  return input;
}
function validateCatalog(catalog) {
  shape(catalog, [
    "schemaVersion",
    "protocol",
    "catalogRevision",
    "sourceArchiveSha256",
    "entries",
  ]);
  if (
    catalog.schemaVersion !== 1 ||
    catalog.protocol !== "openscience-aipoch-audits" ||
    !isHash(catalog.catalogRevision) ||
    !isHash(catalog.sourceArchiveSha256)
  )
    throw new Error("Invalid audit catalog");
  validateEntries(catalog.entries, true);
  return catalog;
}
// Verify decoded original bytes before parsing the authenticated payload or mapping fields.
export function verifyAuditEnvelope(bytes, pin) {
  if (bytes.length > maxEnvelopeBytes)
    throw new Error("Audit envelope exceeds byte limit");
  const envelope = JSON.parse(bytes);
  shape(envelope, ["payload_base64", "signature"]);
  if (typeof envelope.payload_base64 !== "string")
    throw new Error("Invalid audit payload encoding");
  const payload = Buffer.from(envelope.payload_base64, "base64");
  if (
    payload.toString("base64") !== envelope.payload_base64 ||
    !verifyRoot(payload, envelope.signature, pin)
  )
    throw new Error("Invalid audit signature or encoding");
  return validateCatalog(parseMetadataJson(payload));
}

// Audit evidence is independent of the immutable v1 install descriptor.
export async function buildAuditCatalog(root, directory = "audits") {
  const input = parseAuditRegistry(
    await readFile(path.join(directory, "registry.json")),
  );
  const rootModel = parseMetadataJson(jsonBytes(root));
  const selected = new Set(rootModel.skills.map(auditIdentity));
  const entries = [],
    reports = new Map();
  for (const record of input.entries) {
    const bytes = await readFile(
      path.join(directory, "reports", `${record.reportSha256}.json`),
    );
    if (bytes.length > 1024 * 1024 || sha256(bytes) !== record.reportSha256)
      throw new Error("Audit report digest mismatch");
    const report = JSON.parse(bytes);
    if (report.meta?.skill_name !== record.id)
      throw new Error("Audit report Skill identity mismatch");
    const evaluation = reportEvaluation(report);
    if (!selected.has(auditIdentity(record))) continue;
    entries.push({ ...record, evaluation });
    reports.set(`audits/reports/${record.reportSha256}.json`, bytes);
  }
  return {
    catalog: validateCatalog({
      schemaVersion: 1,
      protocol: "openscience-aipoch-audits",
      catalogRevision: rootModel.revision,
      sourceArchiveSha256: input.sourceArchiveSha256,
      entries,
    }),
    reports,
  };
}
export async function publishAuditCatalog({ root, store, signing, directory }) {
  const { catalog, reports } = await buildAuditCatalog(root, directory);
  const previous = await store.read("audits/catalog.json", {
    maxBytes: maxEnvelopeBytes,
  });
  const known = new Set(
    previous === undefined
      ? []
      : verifyAuditEnvelope(previous, signing.expectedPublicKey).entries.map(
          (entry) => `audits/reports/${entry.reportSha256}.json`,
        ),
  );
  const payload = metadataJsonBytes(catalog);
  const signature = signRoot(payload, signing);
  let uploadedReports = 0;
  for (const [relative, bytes] of reports)
    if (!known.has(relative)) {
      await store.putImmutable(relative, bytes);
      uploadedReports++;
    }
  await store.writeAuditCatalog(
    jsonBytes({ payload_base64: payload.toString("base64"), signature }),
  );
  return {
    auditCount: catalog.entries.length,
    uploadedReports,
    reusedReports: reports.size - uploadedReports,
  };
}
