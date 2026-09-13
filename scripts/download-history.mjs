import { parseArgs } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { publishedState, githubStore } from "./lib/transports.mjs";
import { readBundle, writeBundle } from "./lib/bundle.mjs";
import {
  authenticateHistory,
  publishedMetadata,
  loadPublishedCatalog,
} from "./lib/published-history.mjs";
const { values } = parseArgs({
  options: {
    output: { type: "string", default: "dist/history" },
    "revision-only": { type: "boolean", default: false },
  },
});
const state = await publishedState();
if (!state) {
  console.log(
    values["revision-only"]
      ? "none"
      : "No published history; initial snapshot.",
  );
  process.exit(0);
}
const pin = process.env.SKILL_MARKETPLACE_PUBLIC_KEY;
const root = authenticateHistory(state, pin);
if (values["revision-only"]) {
  console.log(root.revision);
  process.exit(0);
}
let cached;
try {
  cached = await readBundle(values.output, { pin });
} catch (error) {
  if (error.code !== "ENOENT" && error.message !== "missing bundle root")
    throw error;
}
const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-history-"));
try {
  const metadata = publishedMetadata(state);
  const store = githubStore({
    repository: "aipoch/openscience-skill-marketplace",
    revision: root.revision,
    temporary,
  });
  const result = await loadPublishedCatalog({
    state,
    pin,
    cached,
    metadata,
    readArtifact: store.read,
  });
  const { candidate, artifactDownloads } = result;
  if (result.cached) {
    console.log(
      `Verified cached history ${root.revision}; no historical object downloads`,
    );
  } else {
    await writeBundle(values.output, candidate);
    await writeFile(
      path.join(values.output, "marketplace.json.sig"),
      state.signatureBytes,
    );
    console.log(
      `Verified history ${root.revision}; metadata read in one Git batch; ${artifactDownloads} ZIP cache misses`,
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
