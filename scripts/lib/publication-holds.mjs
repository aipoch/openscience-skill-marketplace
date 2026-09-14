import { readFile } from "node:fs/promises";
import { assertPath, assertHttps } from "./common.mjs";
import { parseMetadataJson } from "./metadata-json.mjs";

const location = (source) =>
  JSON.stringify([source.repository.toLowerCase(), source.path]);

export function parsePublicationHolds(bytes) {
  const register = parseMetadataJson(bytes);
  if (
    register.schemaVersion !== 1 ||
    !Array.isArray(register.entries) ||
    Object.keys(register).sort().join(",") !== "entries,schemaVersion"
  )
    throw new Error("invalid publication hold register");
  const seen = new Set();
  for (const entry of register.entries) {
    if (
      Object.keys(entry).sort().join(",") !==
        "id,path,reasons,recordKey,repository,resumeConditions" ||
      typeof entry.recordKey !== "string" ||
      !entry.recordKey ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)
    )
      throw new Error("invalid publication hold identity");
    assertHttps(entry.repository);
    if (
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
        entry.repository,
      )
    )
      throw new Error("invalid publication hold repository");
    assertPath(entry.path);
    for (const values of [entry.reasons, entry.resumeConditions])
      if (
        !Array.isArray(values) ||
        !values.length ||
        values.some((v) => typeof v !== "string" || !v.trim())
      )
        throw new Error(
          "publication hold requires reasons and resume conditions",
        );
    const key = location(entry);
    if (seen.has(key)) throw new Error("duplicate publication hold");
    seen.add(key);
  }
  return register.entries;
}

export async function readPublicationHolds() {
  return parsePublicationHolds(await readFile("skills/publication-holds.json"));
}

export function publicationHoldFor(source, holds) {
  return holds.find((hold) => location(hold) === location(source));
}

export function assertNoPublicationHolds(releases, holds) {
  for (const release of releases) {
    const hold = publicationHoldFor(release.source, holds);
    // A new ID, version or commit cannot silently evade a source-directory hold.
    if (hold)
      throw new Error(
        `temporarily withheld from publication: ${hold.recordKey}`,
      );
  }
}
