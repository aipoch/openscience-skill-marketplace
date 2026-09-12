import { parseMetadataJson, metadataJsonBytes } from "./lib/metadata-json.mjs";
import { parseArgs } from "node:util";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPrivateKey } from "node:crypto";
import { readBundle } from "./lib/bundle.mjs";
import { signRoot } from "./lib/signing.mjs";
import { publishSnapshot } from "./lib/publish.mjs";
import { githubStore, s3Store, runCommand } from "./lib/transports.mjs";
import { sha256 } from "./lib/common.mjs";
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
if (
  candidate.root.skills.length !== 584 ||
  candidate.root.skills.some(
    (s) => !manifest.entries.some((e) => e.id === s.id),
  )
)
  throw new Error("production snapshot must contain all 584 approved members");
if (candidate.objects.size + 2 > 1000)
  throw new Error(
    "snapshot exceeds the current 1000-asset publication tool limit",
  );
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
    prefix: "open-science/skill-marketplace/v1",
    temporary: path.join(temporary, "cdn"),
  });
  const result = await publishSnapshot({
    candidate,
    signature,
    pin,
    github,
    cdn,
    baseRevision: context.baseRevision,
  });
  process.stdout.write(metadataJsonBytes(result));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
