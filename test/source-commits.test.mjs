import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { parse as parseYaml } from "yaml";
import {
  metadataJsonBytes,
  parseMetadataJson,
} from "../scripts/lib/metadata-json.mjs";
import {
  selectReleaseEntries,
  assertReleaseSelection,
} from "../scripts/lib/release-plan.mjs";
import { readBundle } from "../scripts/lib/bundle.mjs";
import { signRoot } from "../scripts/lib/signing.mjs";
import {
  inspectSubmission,
  submissionSnapshot,
} from "../scripts/lib/authoring.mjs";
import { providerDirectory } from "../scripts/lib/production-providers.mjs";

const source = {
  repository: "https://github.com/test/source",
  commit: "a".repeat(40),
};
const identities = ["alpha", "beta"].map((id) => ({ id, version: "1.0.0" }));
const entries = identities.map((entry) => ({
  ...entry,
  sourcePath: `skills/${entry.id}`,
}));

test("selected source commits are explicit boundary mappings, not repository/path overrides", () => {
  const plan = { schemaVersion: 1, source, selected: identities, deferred: [] };
  const wire = JSON.parse(metadataJsonBytes(plan));
  wire.selected[1].source_commit = "b".repeat(40);
  const input = structuredClone(wire);
  const resolved = selectReleaseEntries(JSON.stringify(wire), entries, source);
  assert.deepEqual(
    resolved.map((e) => e.sourceCommit),
    [source.commit, "b".repeat(40)],
  );
  assert.deepEqual(wire, input);
  assert.equal("source_commit" in resolved[1], false);
  assert.deepEqual(
    resolved.map((e) => e.sourcePath),
    entries.map((e) => e.sourcePath),
  );
  // Only the validated release plan can choose a commit, never an incidental authority field.
  assert.equal(
    selectReleaseEntries(
      metadataJsonBytes(plan),
      [{ ...entries[0], sourceCommit: "c".repeat(40) }, entries[1]],
      source,
    )[0].sourceCommit,
    source.commit,
  );
  for (const value of [
    null,
    true,
    "main",
    "a".repeat(39),
    "A".repeat(40),
    "--upload-pack=x",
    "b".repeat(40) + "\n",
  ]) {
    const changed = structuredClone(wire);
    changed.selected[1].source_commit = value;
    assert.throws(
      () => selectReleaseEntries(JSON.stringify(changed), entries, source),
      /invalid release plan/,
    );
  }
  for (const [key, value] of Object.entries({
    sourceCommit: "b".repeat(40),
    source_path: "elsewhere",
    repository: "https://github.com/other/repo",
    source: { ...source },
  })) {
    const changed = structuredClone(wire);
    changed.selected[1][key] = value;
    assert.throws(
      () => selectReleaseEntries(JSON.stringify(changed), entries, source),
      /invalid release plan/,
    );
  }
  const deferred = structuredClone(wire);
  deferred.deferred = [{ ...deferred.selected.pop(), reason: "Not selected" }];
  assert.throws(
    () => selectReleaseEntries(JSON.stringify(deferred), entries, source),
    /invalid release plan/,
  );
});

test("two Git snapshots flow through review, fetch, build, signed history and publication selection", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skill-source-commits-"));
  try {
    const upstream = join(directory, "upstream");
    const workspace = join(directory, "input");
    await mkdir(upstream);
    await mkdir(join(workspace, "skills"), { recursive: true });
    await mkdir(join(workspace, "authoring"));
    await writeFile(
      join(workspace, "authoring/production.json"),
      metadataJsonBytes({ schemaVersion: 1, releases: [] }),
    );
    const git = (cwd, ...args) =>
      execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
    const manifestBytes = await readFile(
      new URL("../skills/manifest.json", import.meta.url),
    );
    const manifest = parseMetadataJson(manifestBytes);
    const [alpha, beta] = manifest.entries;
    const identity = ({ id, version }) => ({ id, version });
    const skill = (id, body) =>
      `---\nname: ${id}\ndescription: Test-only source fixture\nlicense: MIT\n---\n${body}\n`;
    for (const entry of [alpha, beta])
      await mkdir(join(upstream, entry.sourcePath), { recursive: true });
    await writeFile(
      join(upstream, alpha.sourcePath, "SKILL.md"),
      skill(alpha.id, "Original release"),
    );
    await writeFile(
      join(upstream, beta.sourcePath, "SKILL.md"),
      "---\nname: [broken\n---\n",
    );
    await writeFile(
      join(upstream, "LICENSE"),
      "Test-only original license notice\n",
    );
    git(upstream, "init", "--quiet");
    const commit = () => {
      git(upstream, "add", ".");
      git(
        upstream,
        "-c",
        "user.name=Test Fixture",
        "-c",
        "user.email=fixture@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "-m",
        "test fixture",
      );
      return git(upstream, "rev-parse", "HEAD");
    };
    const baseline = commit();
    git(upstream, "branch", "baseline", baseline);
    await writeFile(
      join(upstream, alpha.sourcePath, "SKILL.md"),
      skill(alpha.id, "Must not replace the original release"),
    );
    await writeFile(
      join(upstream, beta.sourcePath, "SKILL.md"),
      skill(beta.id, "Repaired new member"),
    );
    await writeFile(
      join(upstream, "LICENSE"),
      "Test-only updated license notice\n",
    );
    const repaired = commit();
    const config = {
      initialVersion: "1.0.0",
      source: { ...source, commit: baseline },
      publisher: { id: "fixture", name: "Fixture", url: "https://example.com" },
    };
    await writeFile(
      join(workspace, "marketplace.config.json"),
      metadataJsonBytes(config),
    );
    await writeFile(join(workspace, "skills/manifest.json"), manifestBytes);
    await writeFile(
      join(workspace, "skills/inclusion-list.md"),
      await readFile(new URL("../skills/inclusion-list.md", import.meta.url)),
    );
    const plan = {
      schemaVersion: 1,
      source: config.source,
      selected: [identity(alpha)],
      deferred: manifest.entries
        .slice(1)
        .map((e) => ({ ...identity(e), reason: "Synthetic fixture deferral" })),
    };
    const savePlan = () =>
      writeFile(
        join(workspace, "skills/release_plan.json"),
        metadataJsonBytes(plan),
      );
    const reviews = {};
    const saveReviews = () =>
      writeFile(
        join(workspace, "skills/reviews.json"),
        metadataJsonBytes(reviews),
      );
    const providerFetchEnv = {};
    const run = (script, args = [], env = {}) =>
      spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL(`../scripts/${script}.mjs`, import.meta.url)),
          ...args,
        ],
        {
          cwd: workspace,
          encoding: "utf8",
          env: { ...process.env, ...providerFetchEnv, ...env },
        },
      );
    const approve = (entry) => {
      const result = run("review-input", [
        "--source",
        upstream,
        "--id",
        entry.id,
        "--license-path",
        "LICENSE",
      ]);
      assert.equal(result.status, 0, result.stderr);
      const evidence = parseMetadataJson(result.stdout);
      reviews[`${entry.id}@${entry.version}`] = {
        sourceCommit: evidence.sourceCommit,
        contentSha256: evidence.contentSha256,
        reviewedBy: "Test Fixture",
        reviewedOn: "2026-09-13",
        licenseExpression: "MIT",
        licenseFiles: evidence.licenseFiles,
      };
      return evidence;
    };
    const build = (output, extra = [], repository = upstream, env = {}) =>
      run(
        "build-catalog",
        ["--source", repository, "--output", output, ...extra],
        env,
      );
    await savePlan();
    const alphaEvidence = approve(alpha);
    assert.equal(alphaEvidence.sourceCommit, baseline);
    await saveReviews();
    const historyPath = join(directory, "history");
    const first = build(historyPath);
    assert.equal(first.status, 0, first.stderr);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pin = publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
    await writeFile(
      join(historyPath, "marketplace.json.sig"),
      JSON.stringify(
        signRoot(await readFile(join(historyPath, "marketplace.json")), {
          privateKey,
          expectedPublicKey: pin,
          keyId: "openscience-skills-fixture",
        }),
      ),
    );
    const history = await readBundle(historyPath, { pin });
    plan.selected.push({ ...identity(beta), sourceCommit: repaired });
    plan.deferred = plan.deferred.filter((e) => e.id !== beta.id);
    await savePlan();
    const betaEvidence = approve(beta);
    assert.equal(betaEvidence.sourceCommit, repaired);
    assert.notEqual(
      betaEvidence.licenseFiles[0].sha256,
      alphaEvidence.licenseFiles[0].sha256,
    );
    await saveReviews();
    const checkout = join(directory, "shallow");
    execFileSync("git", [
      "clone",
      "--quiet",
      "--no-checkout",
      "--depth=1",
      "--branch",
      "baseline",
      pathToFileURL(upstream).href,
      checkout,
    ]);
    git(
      checkout,
      "config",
      `url.${pathToFileURL(upstream).href}.insteadOf`,
      source.repository,
    );
    const missing = build(join(directory, "missing"), [], checkout);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /cat-file|object|revision/i);
    const providerSource = join(directory, "provider-source");
    await mkdir(join(providerSource, "skills/provider-fixture"), {
      recursive: true,
    });
    await writeFile(
      join(providerSource, "skills/provider-fixture/SKILL.md"),
      skill("provider-fixture", "Separate provider source"),
    );
    await writeFile(
      join(providerSource, "LICENSE"),
      "Test-only provider license",
    );
    git(providerSource, "init", "--quiet");
    const providerRepository = "https://github.com/test/provider";
    git(providerSource, "remote", "add", "origin", providerRepository);
    git(providerSource, "add", ".");
    git(
      providerSource,
      "-c",
      "user.name=Test Fixture",
      "-c",
      "user.email=fixture@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "test fixture",
    );
    const provider = {
      schemaVersion: 1,
      id: "provider-fixture",
      version: "1.0.0",
      category: "Other",
      source: {
        repository: providerRepository,
        commit: git(providerSource, "rev-parse", "HEAD"),
        path: "skills/provider-fixture",
      },
      licenseFiles: ["LICENSE"],
    };
    await writeFile(
      join(workspace, "authoring/production.json"),
      metadataJsonBytes({ schemaVersion: 1, releases: [provider] }),
    );
    const providerReview = inspectSubmission(
      provider,
      submissionSnapshot(providerSource, provider),
    ).reviewInput;
    reviews["provider-fixture@1.0.0"] = {
      ...providerReview,
      reviewedBy: "Test Fixture",
      reviewedOn: "2026-09-13",
    };
    await saveReviews();
    Object.assign(providerFetchEnv, {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(providerSource).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: providerRepository,
    });
    const fetched = run("fetch-selected-sources", ["--source", checkout]);
    assert.equal(fetched.status, 0, fetched.stderr);
    assert.match(fetched.stdout, /2 fixed source commits/);
    assert.equal(git(checkout, "cat-file", "-t", repaired), "commit");
    const providerCache = providerDirectory(
      join(workspace, "dist/providers"),
      providerRepository,
    );
    assert.equal(
      git(providerCache, "cat-file", "-t", provider.source.commit),
      "commit",
    );
    assert.equal(git(checkout, "rev-parse", "HEAD"), baseline);
    const again = run("fetch-selected-sources", ["--source", checkout]);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(again.stderr, "");
    const output = join(directory, "candidate");
    const historyArgs = ["--history", historyPath];
    const env = { SKILL_MARKETPLACE_PUBLIC_KEY: pin };
    const success = build(output, historyArgs, checkout, env);
    assert.equal(success.status, 0, success.stderr);
    const built = await readBundle(output);
    const selected = selectReleaseEntries(
      metadataJsonBytes(plan),
      manifest.entries,
      config.source,
    );
    assertReleaseSelection(built.root, selected, config.source, [provider]);
    assert.equal(built.root.skills.length, 3);
    assert.deepEqual(
      built.root.skills.find((s) => s.id === provider.id).source,
      provider.source,
    );
    for (const field of ["repository", "commit", "path"]) {
      const tampered = structuredClone(built.root);
      tampered.skills.find((s) => s.id === provider.id).source[field] = "wrong";
      assert.throws(
        () =>
          assertReleaseSelection(tampered, selected, config.source, [provider]),
        /differs from release selection/,
      );
    }
    const old = built.root.skills.find((s) => s.id === alpha.id);
    const added = built.root.skills.find((s) => s.id === beta.id);
    assert.deepEqual(old, history.root.skills[0]);
    assert.equal(added.source.commit, repaired);
    assert.equal("source_commit" in added, false);
    assert.equal("sourceCommit" in added, false);
    assert.equal(added.source.repository, source.repository);
    assert.equal(added.source.path, beta.sourcePath);
    assert.equal(
      [...built.objects.keys()].filter((p) => p.startsWith("shards/")).length,
      2,
    );
    for (const [path, bytes] of history.objects)
      if (!path.startsWith("indexes/"))
        assert.deepEqual(built.objects.get(path), bytes);
    const stale = structuredClone(built.root);
    stale.skills.find((s) => s.id === beta.id).source.commit = baseline;
    assert.throws(
      () => assertReleaseSelection(stale, selected, config.source, [provider]),
      /differs from release selection/,
    );
    git(
      providerCache,
      "remote",
      "set-url",
      "origin",
      "https://github.com/test/wrong-source",
    );
    assert.match(
      run("fetch-selected-sources", ["--source", checkout]).stderr,
      /provider cache origin differs/,
    );
    git(providerCache, "remote", "set-url", "origin", providerRepository);
    delete reviews["provider-fixture@1.0.0"];
    await saveReviews();
    assert.match(
      build(join(directory, "unreviewed-provider")).stderr,
      /missing maintainer review/,
    );
    reviews["provider-fixture@1.0.0"] = {
      ...providerReview,
      reviewedBy: "Test Fixture",
      reviewedOn: "2026-09-13",
    };
    reviews[`${beta.id}@${beta.version}`].sourceCommit = baseline;
    await saveReviews();
    assert.match(
      build(join(directory, "stale-review")).stderr,
      /invalid reviewed evidence/,
    );
    reviews[`${beta.id}@${beta.version}`].sourceCommit = repaired;
    reviews[`${beta.id}@${beta.version}`].contentSha256 = "0".repeat(64);
    await saveReviews();
    assert.match(
      build(join(directory, "stale-digest")).stderr,
      /reviewed package bytes changed/,
    );
    approve(beta);
    plan.selected[0].sourceCommit = repaired;
    await savePlan();
    approve(alpha);
    await saveReviews();
    assert.match(
      build(join(directory, "immutable"), historyArgs, checkout, env).stderr,
      /immutable release changed/,
    );
    plan.selected[1].sourceCommit = "f".repeat(40);
    await savePlan();
    assert.notEqual(
      run("fetch-selected-sources", ["--source", checkout]).status,
      0,
    );
    plan.selected[1].sourceCommit = git(
      upstream,
      "rev-parse",
      `${repaired}:LICENSE`,
    );
    await savePlan();
    assert.match(
      run("fetch-selected-sources", ["--source", checkout]).stderr,
      /Git commit object/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CI rehearsal and production fetch the same selected commits before reading source payloads", async () => {
  for (const filename of ["validate.yml", "publish.yml"]) {
    const workflow = parseYaml(
      await readFile(
        new URL(`../.github/workflows/${filename}`, import.meta.url),
        "utf8",
      ),
    );
    const steps =
      workflow.jobs[filename === "validate.yml" ? "validate" : "publish"].steps;
    const fetchIndex = steps.findIndex(
      (s) =>
        s.run ===
        "node scripts/fetch-selected-sources.mjs --source dist/upstream",
    );
    assert.ok(fetchIndex > 0);
    assert.equal(
      steps[fetchIndex - 1].with.repository,
      "aipoch/medical-research-skills",
    );
    assert.equal(steps[fetchIndex - 1].with["persist-credentials"], false);
    assert.ok(
      steps.findIndex((s) => s.run?.includes("build:catalog")) > fetchIndex,
    );
    assert.equal(steps[fetchIndex].if, undefined); // focused Windows workflow must cover this path too
  }
});
