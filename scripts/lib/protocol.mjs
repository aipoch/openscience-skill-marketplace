import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { assertPath, assertSource, assertHttps } from "./common.mjs";
import { sourceUrl } from "./catalog.mjs";
const ajv = new Ajv({ allErrors: true, strict: true });
const check = (fn) => (value) => {
  try {
    fn(value);
    return true;
  } catch {
    return false;
  }
};
ajv.addFormat("https-url", check(assertHttps));
ajv.addFormat("safe-path", check(assertPath));
ajv.addFormat(
  "iso-date",
  (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value,
);
const validators = {};
for (const name of [
  "common",
  "skill-release",
  "marketplace",
  "marketplace-signature",
  "release-index",
]) {
  const schema = JSON.parse(
    readFileSync(
      new URL(`../../protocol/schemas/${name}.schema.json`, import.meta.url),
    ),
  );
  ajv.addSchema(schema);
  if (name !== "common") validators[name] = ajv.getSchema(schema.$id);
}
function immutableUrl(value) {
  const url = assertHttps(value);
  if (
    url.hostname !== "github.com" ||
    !/^\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\/.+/.test(url.pathname)
  )
    throw new Error("evidence URL must be an immutable GitHub blob permalink");
}
export function validateDocument(kind, value) {
  if (!validators[kind]?.(value))
    throw new Error(
      `invalid ${kind} schema: ${ajv.errorsText(validators[kind]?.errors)}`,
    );
  const skills =
    kind === "marketplace"
      ? value.skills
      : kind === "skill-release"
        ? [value.skill]
        : [];
  const seen = new Set();
  for (const skill of skills) {
    assertSource(skill.source);
    if (seen.has(skill.id)) throw new Error("duplicate Skill identity");
    seen.add(skill.id);
    if (typeof skill.license === "object")
      for (const evidence of skill.license.evidence) immutableUrl(evidence.url);
    if (skill.evaluation) {
      const e = skill.evaluation;
      immutableUrl(e.report_url);
      const prefix = sourceUrl(skill.source, skill.source.path + "/");
      if (!e.report_url.startsWith(prefix))
        throw new Error("evaluation report must match immutable Skill source");
      const relative = decodeURIComponent(e.report_url.slice(prefix.length));
      assertPath(relative);
      if (
        !relative.endsWith(".json") ||
        sourceUrl(skill.source, skill.source.path + "/" + relative) !==
          e.report_url
      )
        throw new Error("evaluation report must match immutable Skill source");
      for (const pair of [e, e.static_score, e.dynamic_score].filter(Boolean))
        if (pair.score > pair.max_score)
          throw new Error("evaluation score exceeds maximum");
    }
    if (
      kind === "marketplace" &&
      skill.release.path !== `releases/${skill.id}/${skill.version}.json`
    )
      throw new Error("release path identity mismatch");
  }
  const artifacts =
    kind === "marketplace"
      ? value.skills.map((s) => [s.artifact, s.id])
      : kind === "skill-release"
        ? [[value.artifact, value.skill.id]]
        : [];
  for (const [artifact, id] of artifacts)
    if (
      artifact.path !== `shards/${artifact.sha256}.zip` ||
      artifact.skill_path !== id
    )
      throw new Error("artifact path or Skill identity mismatch");
  return value;
}
export function evaluationToWire(value) {
  if (!value) return undefined;
  const wire = {
    kind: value.kind,
    score: value.score,
    max_score: value.maxScore,
    report_url: value.reportUrl,
  };
  for (const [key, target] of [
    ["evaluatedOn", "evaluated_on"],
    ["evaluatorVersion", "evaluator_version"],
    ["skillVersion", "skill_version"],
  ])
    if (value[key] !== undefined) wire[target] = value[key];
  for (const [key, target] of [
    ["staticScore", "static_score"],
    ["dynamicScore", "dynamic_score"],
  ])
    if (value[key])
      wire[target] = {
        score: value[key].score,
        max_score: value[key].maxScore,
      };
  return wire;
}

export function toAppEntry(listing) {
  const result = {
    id: listing.id,
    displayName: listing.display_name,
    summary: listing.summary,
    category: listing.category
      .split("-")
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(" "),
    version: listing.version,
    publisher: { name: listing.publisher.name, url: listing.publisher.url },
    source: {
      repository: listing.source.repository,
      commit: listing.source.commit,
      path: listing.source.path,
    },
    license:
      typeof listing.license === "string"
        ? listing.license
        : listing.license.expression,
    ...(listing.authors ? { authors: listing.authors } : {}),
  };
  if (listing.evaluation) {
    const value = listing.evaluation;
    const evaluation = {
      kind: value.kind,
      score: value.score,
      maxScore: value.max_score,
      reportUrl: value.report_url,
    };
    for (const [wire, key] of [
      ["evaluated_on", "evaluatedOn"],
      ["evaluator_version", "evaluatorVersion"],
      ["skill_version", "skillVersion"],
    ])
      if (value[wire] !== undefined) evaluation[key] = value[wire];
    for (const [wire, key] of [
      ["static_score", "staticScore"],
      ["dynamic_score", "dynamicScore"],
    ])
      if (value[wire])
        evaluation[key] = {
          score: value[wire].score,
          maxScore: value[wire].max_score,
        };
    result.evaluation = evaluation;
  }
  return result;
}
