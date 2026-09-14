import { execFileSync, spawnSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseMetadataJson } from "./lib/metadata-json.mjs";
import { selectReleaseEntries } from "./lib/release-plan.mjs";
import { validateManifest } from "./lib/catalog.mjs";
import {
  readProductionProviders,
  providerDirectory,
} from "./lib/production-providers.mjs";
import { submissionSnapshot } from "./lib/authoring.mjs";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    providers: { type: "string", default: "dist/providers" },
  },
});
if (!values.source)
  throw new Error("--source <local upstream Git repository> is required");
const config = parseMetadataJson(await readFile("marketplace.config.json"));
const manifest = parseMetadataJson(await readFile("skills/manifest.json"));
validateManifest(manifest, await readFile("skills/inclusion-list.md"));
const selected = selectReleaseEntries(
  await readFile("skills/release_plan.json"),
  manifest.entries,
  config.source,
);
const commits = new Set([
  config.source.commit,
  ...selected.map((entry) => entry.sourceCommit ?? config.source.commit),
]);
const providers = await readProductionProviders(manifest.entries);
function ensureCommit(directory, repository, commit) {
  const args = ["-C", directory];
  const existing = spawnSync("git", [...args, "cat-file", "-t", commit], {
    encoding: "utf8",
  });
  if (existing.error) throw existing.error;
  if (existing.status !== 0) {
    execFileSync(
      "git",
      [...args, "fetch", "--no-tags", "--depth=1", repository, commit],
      { stdio: "inherit" },
    );
  }
  const type = execFileSync("git", [...args, "cat-file", "-t", commit], {
    encoding: "utf8",
  }).trim();
  if (type !== "commit")
    throw new Error("source must reference a Git commit object");
}
for (const commit of commits)
  ensureCommit(values.source, config.source.repository, commit);
for (const [repository, releases] of Map.groupBy(
  providers,
  (release) => release.source.repository,
)) {
  const directory = providerDirectory(values.providers, repository);
  await mkdir(directory, { recursive: true });
  execFileSync("git", ["init", "--quiet", directory]);
  const origin = spawnSync(
    "git",
    ["-C", directory, "config", "--get", "remote.origin.url"],
    { encoding: "utf8" },
  );
  if (origin.error) throw origin.error;
  if (origin.status !== 0)
    execFileSync("git", [
      "-C",
      directory,
      "remote",
      "add",
      "origin",
      repository,
    ]);
  else if (origin.stdout.trim() !== repository)
    throw new Error("provider cache origin differs from selected repository");
  for (const commit of new Set(
    releases.map((release) => release.source.commit),
  ))
    ensureCommit(directory, repository, commit);
  // Verify the same origin/commit contract used by the provider build path.
  for (const release of releases) submissionSnapshot(directory, release);
}
console.log(
  `Available: ${commits.size} fixed source commits and ${providers.length} provider releases; checkout unchanged.`,
);
