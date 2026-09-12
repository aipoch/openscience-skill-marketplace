export const categories = [
  "academic-writing",
  "data-analysis",
  "evidence-insight",
  "other",
  "protocol-design",
];
export const inclusionTiers = [
  "mvp-candidate",
  "sandbox-beta",
  "catalog-candidate",
  "restricted-index",
];

export function parseInclusionList(markdown) {
  const entries = [];
  const seen = new Set();
  let category;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^### (.+)（\d+）$/);
    if (heading) category = heading[1].toLowerCase().replaceAll(" ", "-");
    const row = line.match(
      /^- `([^`]+)` — (mvp-candidate|sandbox-beta|catalog-candidate|restricted-index) — (scientific-skills|awesome-med-research-skills)$/,
    );
    if (!row) continue;
    if (!categories.includes(category))
      throw new Error("unknown inclusion category");
    if (seen.has(row[1])) throw new Error(`duplicate inclusion ID: ${row[1]}`);
    seen.add(row[1]);
    entries.push({
      id: row[1],
      category,
      inclusionTier: row[2],
      collection: row[3],
    });
  }
  return entries;
}

import { parseDocument } from "yaml";

export function inspectFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { valid: false, errors: ["missing YAML frontmatter"] };
  const doc = parseDocument(match[1]);
  const errors = doc.errors.map((x) => x.message.split("\n")[0]);
  let data;
  try {
    data = doc.toJS({ maxAliasCount: 50 });
  } catch (e) {
    errors.push(e.message);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    errors.push("frontmatter must be a mapping");
  if (typeof data?.name !== "string" || !data.name.trim())
    errors.push("frontmatter requires a name");
  if (typeof data?.description !== "string" || !data.description.trim())
    errors.push("frontmatter requires a description");
  // Recovery is for the audit's identity match only; invalid documents never pass publication.
  const name = errors.length
    ? match[1].match(/^name:\s*["']?([^\r\n"']+)/m)?.[1]?.trim()
    : data.name;
  return {
    name,
    valid: errors.length === 0,
    syntaxValid: doc.errors.length === 0,
    errors,
    ...(errors.length ? {} : { data }),
  };
}

export function sourceUrl(source, relativePath) {
  return `${source.repository}/blob/${source.commit}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

export function extractEvaluation(
  report,
  source,
  id,
  reportPath = `${source.path}/eval_report_${id}_result.json`,
) {
  if (report === undefined) return undefined;
  if (report?.meta?.skill_name !== id)
    throw new Error("evaluation identity does not match Skill");
  const pair = (score, maxScore) => {
    if (
      !Number.isFinite(score) ||
      !Number.isFinite(maxScore) ||
      maxScore <= 0 ||
      score < 0 ||
      score > maxScore
    )
      throw new Error("invalid evaluation score");
    return { score, maxScore };
  };
  assertPath(reportPath);
  if (
    !reportPath.startsWith(source.path + "/") ||
    !reportPath.endsWith(".json")
  )
    throw new Error("evaluation report must belong to Skill source");
  const result = {
    kind: "upstream-self-assessment",
    ...pair(report.final?.score, report.final?.max),
    reportUrl: sourceUrl(source, reportPath),
  };
  if (report.static_score !== undefined)
    result.staticScore = pair(
      report.static_score.subtotal,
      report.static_score.max,
    );
  if (report.dynamic_score !== undefined)
    result.dynamicScore = pair(
      report.dynamic_score.execution_avg,
      report.dynamic_score.max,
    );
  for (const [wire, key] of [
    ["evaluated_on", "evaluatedOn"],
    ["evaluator_version", "evaluatorVersion"],
    ["skill_version", "skillVersion"],
  ]) {
    if (report.meta[wire] !== undefined) {
      if (typeof report.meta[wire] !== "string" || !report.meta[wire].trim())
        throw new Error(`invalid evaluation ${wire}`);
      result[key] = report.meta[wire];
    }
  }
  return result;
}

import { sha256, assertPath } from "./common.mjs";

export function validateManifest(manifest, authority) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.authoritySha256 !== sha256(authority)
  )
    throw new Error("manifest authority digest mismatch");
  const expected = parseInclusionList(authority.toString());
  if (expected.length !== 584 || manifest.entries?.length !== 584)
    throw new Error("manifest must preserve exact 584-member membership");
  const seen = new Set();
  for (const entry of manifest.entries) {
    const original = expected.find((x) => x.id === entry.id);
    if (
      !original ||
      seen.has(entry.id) ||
      ["category", "inclusionTier", "collection"].some(
        (k) => original[k] !== entry[k],
      )
    )
      throw new Error(`manifest membership mismatch: ${entry.id}`);
    if (typeof entry.version !== "string" || !entry.version.trim())
      throw new Error(`missing package version: ${entry.id}`);
    seen.add(entry.id);
    assertPath(entry.sourcePath);
    if (!entry.sourcePath.startsWith(`${entry.collection}/`))
      throw new Error(`manifest source collection mismatch: ${entry.id}`);
  }
}
