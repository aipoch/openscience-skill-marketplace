import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { parseMetadataJson } from "./metadata-json.mjs";
import { assertSource } from "./common.mjs";

const ajv = new Ajv({ allErrors: true, strict: true });
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
      new URL("../../skills/release_plan.schema.json", import.meta.url),
    ),
  ),
);

// A release plan partitions the full authority; selection never implies review.
export function selectReleaseEntries(bytes, entries, source) {
  const wire = JSON.parse(bytes);
  if (!validate(wire))
    throw new Error(`invalid release plan: ${ajv.errorsText(validate.errors)}`);
  const plan = parseMetadataJson(bytes);
  assertSource(source);
  if (
    plan.source.repository !== source.repository ||
    plan.source.commit !== source.commit
  )
    throw new Error("release plan source differs from configured source");
  const key = (entry) => `${entry.id}@${entry.version}`;
  const available = new Set(entries.map(key));
  if (
    available.size !== entries.length ||
    new Set(entries.map((e) => e.id)).size !== entries.length
  )
    throw new Error("release authority contains duplicate members");
  const seen = new Set();
  for (const entry of [...plan.selected, ...plan.deferred]) {
    const identity = key(entry);
    if (!available.has(identity))
      throw new Error(
        `release plan contains unknown member or version: ${identity}`,
      );
    if (seen.has(identity))
      throw new Error(
        `release plan contains duplicate or overlapping member: ${identity}`,
      );
    seen.add(identity);
  }
  if (seen.size !== available.size)
    throw new Error("release plan must account for every manifest member");
  const selected = new Map(plan.selected.map((entry) => [key(entry), entry]));
  return entries
    .filter((entry) => selected.has(key(entry)))
    .map((entry) => {
      const { sourceCommit } = selected.get(key(entry));
      return { ...entry, sourceCommit: sourceCommit ?? source.commit };
    });
}

// Call after authenticating/validating a candidate bundle, before signing it.
export function assertReleaseSelection(root, selected, source, providers = []) {
  const releases = [
    ...selected.map((entry) => ({
      ...entry,
      source: {
        repository: source.repository,
        commit: entry.sourceCommit ?? source.commit,
        path: entry.sourcePath,
      },
    })),
    ...providers,
  ];
  if (!releases.length || root.skills.length !== releases.length)
    throw new Error(
      "production snapshot must contain exactly the selected members",
    );
  const expected = new Map(releases.map((entry) => [entry.id, entry]));
  if (expected.size !== releases.length)
    throw new Error("duplicate production selection");
  for (const skill of root.skills) {
    const entry = expected.get(skill.id);
    if (
      !entry ||
      skill.version !== entry.version ||
      skill.source.repository !== entry.source.repository ||
      skill.source.commit !== entry.source.commit ||
      skill.source.path !== entry.source.path
    )
      throw new Error(
        `production snapshot differs from release selection: ${skill.id}`,
      );
    expected.delete(skill.id);
  }
  if (expected.size)
    throw new Error("production snapshot is missing selected members");
}
