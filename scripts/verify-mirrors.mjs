import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { githubStore, publishedState } from "./lib/transports.mjs";
import { parseArgs } from "node:util";
import { readBundle } from "./lib/bundle.mjs";
import { verifyRoot } from "./lib/signing.mjs";
const { values } = parseArgs({
  options: { history: { type: "string", default: "dist/history" } },
});
const pin = process.env.SKILL_MARKETPLACE_PUBLIC_KEY;
if (!pin || !process.env.SKILL_MARKETPLACE_CDN_BASE_URL)
  throw new Error("verification requires public trust pin and CDN base URL");
const candidate = await readBundle(values.history, { pin });
const { fetchBytes, skillCdnBaseUrl } = await import("./lib/transports.mjs");
const base = skillCdnBaseUrl(process.env.SKILL_MARKETPLACE_CDN_BASE_URL);
const rootBytes = await fetchBytes(new URL("marketplace.json", base), {
  maxBytes: 4 * 1024 * 1024,
});
const signatureBytes = await fetchBytes(new URL("marketplace.json.sig", base), {
  maxBytes: 4096,
});
if (
  !rootBytes?.equals(candidate.rootBytes) ||
  !signatureBytes ||
  !verifyRoot(rootBytes, JSON.parse(signatureBytes), pin)
)
  throw new Error("CDN signed root differs from GitHub");
const state = await publishedState();
if (!state || !state.rootBytes.equals(candidate.rootBytes))
  throw new Error("GitHub root changed during audit");
const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-mirror-audit-"));
try {
  const github = githubStore({
    repository: "aipoch/openscience-skill-marketplace",
    revision: candidate.root.revision,
    temporary,
  });
  for (const [relative, bytes] of candidate.objects) {
    const githubBytes = await github.read(relative, { maxBytes: bytes.length });
    if (!githubBytes?.equals(bytes))
      throw new Error(`GitHub asset differs from signed catalog: ${relative}`);
    const fetched = await fetchBytes(new URL(relative, base), {
      maxBytes: bytes.length,
    });
    if (!fetched?.equals(bytes))
      throw new Error(`CDN differs from GitHub: ${relative}`);
  }
  console.log(
    `Verified GitHub/CDN equality for snapshot ${candidate.root.revision}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
