import { parseArgs } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { publishedState, githubStore } from "./lib/transports.mjs";
import { verifyRoot } from "./lib/signing.mjs";
import { loadCatalog } from "./lib/build.mjs";
import { writeBundle } from "./lib/bundle.mjs";
const { values } = parseArgs({
  options: { output: { type: "string", default: "dist/history" } },
});
const state = await publishedState();
if (!state) {
  console.log("No published history; initial snapshot.");
  process.exit(0);
}
const pin = process.env.SKILL_MARKETPLACE_PUBLIC_KEY;
if (!pin || !verifyRoot(state.rootBytes, JSON.parse(state.signatureBytes), pin))
  throw new Error("published history requires a matching independent pin");
const root = JSON.parse(state.rootBytes);
const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-history-"));
try {
  const store = githubStore({
    repository: "aipoch/openscience-skill-marketplace",
    revision: root.revision,
    temporary,
  });
  const candidate = await loadCatalog(state.rootBytes, store.read);
  await writeBundle(values.output, candidate);
  await writeFile(
    path.join(values.output, "marketplace.json.sig"),
    state.signatureBytes,
  );
  console.log(`Verified history ${root.revision}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
