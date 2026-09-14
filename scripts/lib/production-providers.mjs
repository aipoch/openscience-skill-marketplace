import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseReleaseConfig } from "./authoring.mjs";
import { sha256, utf8Compare } from "./common.mjs";

// Explicit production enrollment, separate from the immutable original authority.
export function parseProductionProviders(bytes, selectedOriginals) {
  const register = JSON.parse(bytes);
  if (
    !register ||
    Array.isArray(register) ||
    Object.keys(register).sort().join(",") !== "releases,schema_version" ||
    register.schema_version !== 1 ||
    !Array.isArray(register.releases)
  )
    throw new Error("invalid production provider register");
  const ids = new Set(selectedOriginals.map((entry) => entry.id));
  const sources = new Set();
  const releases = register.releases.map((wire) => {
    const release = parseReleaseConfig(JSON.stringify(wire));
    const location = `${release.source.repository.replace(/\.git$/, "").toLowerCase()}:${release.source.path}`;
    if (ids.has(release.id) || sources.has(location))
      throw new Error(
        `duplicate production provider or selected original member: ${release.id}`,
      );
    ids.add(release.id);
    sources.add(location);
    return release;
  });
  return releases.sort((a, b) => utf8Compare(a.id, b.id));
}

export async function readProductionProviders(selectedOriginals) {
  return parseProductionProviders(
    await readFile("authoring/production.json"),
    selectedOriginals,
  );
}

export function providerDirectory(root, repository) {
  return join(root, sha256(repository));
}

// History must already be authenticated by readBundle/publicationParent.
// Check all retained releases, including IDs no longer in the current listing.
export function assertProviderHistory(providers, history) {
  if (!history) return;
  const selected = new Map(providers.map((release) => [release.id, release]));
  for (const [path, bytes] of history.objects) {
    if (!path.startsWith("releases/")) continue;
    const previous = JSON.parse(bytes).skill;
    const release = selected.get(previous.id);
    if (
      release &&
      (release.source.repository !== previous.source.repository ||
        release.source.path !== previous.source.path)
    )
      throw new Error(
        `published Skill source cannot be replaced: ${previous.id}`,
      );
  }
}
