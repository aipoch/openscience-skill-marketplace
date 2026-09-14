import {
  publishedMetadata,
  publicationParent,
} from "./lib/published-history.mjs";
import { jsonBytes, sha256 } from "./lib/common.mjs";
import { parseMetadataJson, metadataJsonBytes } from "./lib/metadata-json.mjs";
import {
  selectReleaseEntries,
  assertReleaseSelection,
} from "./lib/release-plan.mjs";
import { validateManifest } from "./lib/catalog.mjs";
import {
  readProductionProviders,
  assertProviderHistory,
} from "./lib/production-providers.mjs";
import { parseArgs } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPrivateKey } from "node:crypto";
import { readBundle } from "./lib/bundle.mjs";
import { signRoot } from "./lib/signing.mjs";
import { publishSnapshot } from "./lib/publish.mjs";
import { publishAuditCatalog } from "./lib/aipoch-audits.mjs";
import {
  githubStore,
  s3Store,
  runCommand,
  publishedState,
} from "./lib/transports.mjs";
const { values } = parseArgs({
  options: { candidate: { type: "string", default: "dist/candidate" } },
});
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GITHUB_REF !== "refs/heads/main" ||
  process.env.SKILL_MARKETPLACE_PUBLISH_ENABLED !== "true"
)
  throw new Error(
    "production publication requires the protected main workflow",
  );
const required = [
  "GITHUB_REPOSITORY",
  "GITHUB_SHA",
  "SKILL_MARKETPLACE_PUBLIC_KEY",
  "SKILL_MARKETPLACE_KEY_FINGERPRINT",
  "SKILL_MARKETPLACE_KEY_ID",
  "SKILL_MARKETPLACE_PRIVATE_KEY",
  "SKILL_MARKETPLACE_BUCKET",
  "SKILL_MARKETPLACE_CDN_BASE_URL",
  "SKILL_MARKETPLACE_CDN_DISTRIBUTION_ID",
];
for (const key of required)
  if (!process.env[key])
    throw new Error(`missing protected configuration: ${key}`);
if (process.env.GITHUB_REPOSITORY !== "aipoch/openscience-skill-marketplace")
  throw new Error("production workflow must run in the official repository");
const latest = (
  await runCommand("git", ["ls-remote", "origin", "refs/heads/main"])
)
  .toString()
  .split(/\s/)[0];
if (latest !== process.env.GITHUB_SHA)
  throw new Error("publication must use current main");
const pin = process.env.SKILL_MARKETPLACE_PUBLIC_KEY;
if (
  sha256(Buffer.from(pin, "base64")) !==
  process.env.SKILL_MARKETPLACE_KEY_FINGERPRINT
)
  throw new Error("public-key fingerprint mismatch");
const candidate = await readBundle(values.candidate);
const manifest = parseMetadataJson(await readFile("skills/manifest.json"));
validateManifest(manifest, await readFile("skills/inclusion-list.md"));
const config = parseMetadataJson(await readFile("marketplace.config.json"));
const selected = selectReleaseEntries(
  await readFile("skills/release_plan.json"),
  manifest.entries,
  config.source,
);
const providers = await readProductionProviders(selected);
assertReleaseSelection(candidate.root, selected, config.source, providers);
const state = await publishedState();
const metadata = state ? publishedMetadata(state) : new Map();
const history = await publicationParent(candidate, metadata, pin);
assertProviderHistory(providers, history);
if (candidate.objects.size + 2 > 1000)
  throw new Error("snapshot exceeds the 1000-asset publication limit");
const privateKey = createPrivateKey({
  key: Buffer.from(process.env.SKILL_MARKETPLACE_PRIVATE_KEY, "base64"),
  type: "pkcs8",
  format: "der",
});
const signature = signRoot(candidate.rootBytes, {
  privateKey,
  expectedPublicKey: pin,
  keyId: process.env.SKILL_MARKETPLACE_KEY_ID,
});
const context = parseMetadataJson(
  await readFile(path.join(values.candidate, "build-context.json")),
);
const temporary = await mkdtemp(path.join(os.tmpdir(), "skill-production-"));
try {
  const github = githubStore({
    repository: process.env.GITHUB_REPOSITORY,
    revision: candidate.root.revision,
    sourceCommit: process.env.GITHUB_SHA,
    temporary: path.join(temporary, "github"),
    candidate,
    baseRevision: context.baseRevision,
  });
  const cdn = s3Store({
    bucket: process.env.SKILL_MARKETPLACE_BUCKET,
    baseUrl: process.env.SKILL_MARKETPLACE_CDN_BASE_URL,
    distributionId: process.env.SKILL_MARKETPLACE_CDN_DISTRIBUTION_ID,
    temporary: path.join(temporary, "cdn"),
  });
  const result = await publishSnapshot({
    candidate,
    signature,
    pin,
    github,
    cdn,
    baseRevision: context.baseRevision,
    history,
  });
  await publishAuditCatalog({
    root: candidate.root,
    store: cdn,
    signing: {
      privateKey,
      expectedPublicKey: pin,
      keyId: process.env.SKILL_MARKETPLACE_KEY_ID,
    },
  });
  await writeFile(
    path.join(values.candidate, "marketplace.json.sig"),
    jsonBytes(signature),
  );
  if (process.env.GITHUB_OUTPUT)
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `revision=${candidate.root.revision}\n`,
      { flag: "a" },
    );
  process.stdout.write(metadataJsonBytes(result));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
