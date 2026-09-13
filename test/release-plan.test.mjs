import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
  selectReleaseEntries,
  assertReleaseSelection,
} from "../scripts/lib/release-plan.mjs";
import {
  metadataJsonBytes,
  parseMetadataJson,
} from "../scripts/lib/metadata-json.mjs";
import { prepareCandidates } from "../scripts/lib/prepare.mjs";
import { buildCatalog, loadCatalog } from "../scripts/lib/build.mjs";
import { contentDigest } from "../scripts/lib/package.mjs";
import { sha256 } from "../scripts/lib/common.mjs";
import { readBundle } from "../scripts/lib/bundle.mjs";
import { toAppEntry } from "../scripts/lib/protocol.mjs";
import { makeCandidate } from "./fixtures.mjs";

const source = {
  repository: "https://github.com/test/source",
  commit: "a".repeat(40),
};
const entries = ["alpha", "beta", "gamma"].map((id) => ({
  id,
  version: "1.0.0",
  sourcePath: `skills/${id}`,
}));
const identity = ({ id, version }) => ({ id, version });
function plan() {
  return {
    schemaVersion: 1,
    source,
    selected: entries.slice(0, 2).map(identity),
    deferred: [{ ...identity(entries[2]), reason: "Test-only source issue" }],
  };
}
const select = (value, authority = entries) =>
  selectReleaseEntries(metadataJsonBytes(value), authority, source);

test("release plans require an exact, versioned partition and a matching source", () => {
  const value = plan();
  const original = structuredClone(value);
  assert.deepEqual(
    select(value),
    entries.slice(0, 2).map((entry) => ({
      ...entry,
      sourceCommit: source.commit,
    })),
  );
  assert.deepEqual(value, original);
  for (const mutate of [
    (p) => p.selected.push(p.selected[0]),
    (p) => p.deferred.push(p.deferred[0]),
    (p) => p.deferred.push({ ...p.selected[0], reason: "Overlap" }),
    (p) => p.selected.pop(),
    (p) => (p.selected[0].id = "unknown"),
    (p) => (p.selected[0].version = "2.0.0"),
    (p) => (p.source = { ...source, commit: "b".repeat(40) }),
    (p) =>
      (p.source = { ...source, repository: "https://github.com/other/source" }),
    (p) => (p.selected = []),
    (p) => (p.selected[0].version = "latest"),
    (p) => (p.deferred[0].reason = " \n\t"),
    (p) => delete p.deferred[0].reason,
    (p) => (p.deferred = null),
    (p) => (p.selected[0].reason = "Unexpected field"),
    (p) => (p.skipErrors = true),
  ]) {
    const changed = structuredClone(plan());
    mutate(changed);
    assert.throws(() => select(changed), /release plan/);
  }
  const legacy = JSON.parse(metadataJsonBytes(plan()));
  legacy.schemaVersion = legacy.schema_version;
  delete legacy.schema_version;
  assert.throws(
    () => selectReleaseEntries(JSON.stringify(legacy), entries, source),
    /invalid release plan/,
  );
  assert.throws(
    () => select(plan(), [...entries, entries[0]]),
    /duplicate members/,
  );
});

test("deferred source issues are excluded but every selected license and source gate remains mandatory", () => {
  const candidates = entries.map((e) => makeCandidate(e.id));
  const license = Buffer.from("Test-only license evidence");
  const files = new Map([["LICENSE", license]]);
  for (const candidate of candidates)
    for (const file of candidate.files)
      files.set(candidate.skill.source.path + "/" + file.path, file.bytes);
  const snapshot = {
    files: [...files].map(([path, bytes]) => ({
      path,
      mode: "100644",
      size: bytes.length,
    })),
    read: (paths) => new Map(paths.map((path) => [path, files.get(path)])),
  };
  const audited = entries.map((e, i) => ({
    ...e,
    source: candidates[i].skill.source,
    description: "Test-only fixture",
    category: "Other",
    declaredLicense: "MIT",
    issues:
      i === 2
        ? [{ code: "invalid-yaml", detail: "Deferred test fixture" }]
        : [],
  }));
  const selected = select(plan(), audited);
  const config = { publisher: candidates[0].skill.publisher };
  assert.throws(
    () => prepareCandidates({ entries: selected }, {}, config, snapshot),
    (error) => {
      assert.deepEqual(
        error.blockers.map((b) => [b.id, b.code]),
        [
          ["alpha", "missing-review"],
          ["beta", "missing-review"],
        ],
      );
      return true;
    },
  );
  const reviews = Object.fromEntries(
    candidates.slice(0, 2).map((c) => [
      `${c.skill.id}@1.0.0`,
      {
        sourceCommit: source.commit,
        contentSha256: contentDigest(c.files),
        reviewedBy: "Test-only reviewer",
        reviewedOn: "2026-09-12",
        licenseExpression: "MIT",
        licenseFiles: [{ path: "LICENSE", sha256: sha256(license) }],
      },
    ]),
  );
  assert.equal(
    prepareCandidates({ entries: selected }, reviews, config, snapshot).length,
    2,
  );
  selected[0].issues.push({
    code: "invalid-yaml",
    detail: "Unexpected selected failure",
  });
  assert.throws(
    () => prepareCandidates({ entries: selected }, reviews, config, snapshot),
    /publication blocked/,
  );
  selected[0].issues = [];
  reviews["alpha@1.0.0"].contentSha256 = "0".repeat(64);
  assert.throws(
    () => prepareCandidates({ entries: selected }, reviews, config, snapshot),
    /package bytes changed/,
  );
});

test("selected listings and details retain history, while the signing guard rejects a different selection", async () => {
  const candidates = entries.map((e) => makeCandidate(e.id));
  const previous = buildCatalog(candidates);
  const selected = select(plan());
  const built = buildCatalog(
    candidates.filter((c) => selected.some((e) => e.id === c.skill.id)),
    { history: previous.objects, previousRoot: previous.root },
  );
  assertReleaseSelection(built.root, selected, source);
  assert.deepEqual(
    built.root.skills.map((s) => s.id),
    ["alpha", "beta"],
  );
  assert.deepEqual(
    built.objects.get("releases/gamma/1.0.0.json"),
    previous.objects.get("releases/gamma/1.0.0.json"),
  );
  const loaded = await loadCatalog(built.rootBytes, async (path) =>
    built.objects.get(path),
  );
  for (const listing of loaded.root.skills) {
    const detail = JSON.parse(loaded.objects.get(listing.release.path));
    assert.deepEqual(toAppEntry(listing), toAppEntry(detail.skill));
  }
  assert.deepEqual(
    buildCatalog(candidates.slice(0, 2), {
      history: built.objects,
      previousRoot: built.root,
    }).rootBytes,
    built.rootBytes,
  );
  assert.throws(
    () => assertReleaseSelection(previous.root, selected, source),
    /exactly the selected/,
  );
  for (const mutate of [
    (root) => root.skills.pop(),
    (root) => (root.skills[1] = root.skills[0]),
    (root) => (root.skills[0].id = "gamma"),
    (root) => (root.skills[0].version = "2.0.0"),
    (root) =>
      (root.skills[0].source.repository = "https://github.com/other/source"),
    (root) => (root.skills[0].source.commit = "b".repeat(40)),
    (root) => (root.skills[0].source.path = "skills/elsewhere"),
  ]) {
    const root = structuredClone(built.root);
    mutate(root);
    assert.throws(
      () => assertReleaseSelection(root, selected, source),
      /production snapshot/,
    );
  }
  assert.throws(
    () => assertReleaseSelection({ skills: [] }, [], source),
    /exactly the selected/,
  );
});

test("committed release retains prior members and pins the repaired skill separately", async () => {
  const manifest = parseMetadataJson(
    await readFile(new URL("../skills/manifest.json", import.meta.url)),
  );
  const config = parseMetadataJson(
    await readFile(new URL("../marketplace.config.json", import.meta.url)),
  );
  const bytes = await readFile(
    new URL("../skills/release_plan.json", import.meta.url),
  );
  const selected = selectReleaseEntries(bytes, manifest.entries, config.source);
  const retainedIds = [
    "abstract-summarizer",
    "abstract-trimmer",
    "academic-abstract-refiner",
    "academic-cv-generator",
    "academic-highlight-generator",
    "acronym-unpacker",
    "active-comparator-single-soc-faers-safety-comparison",
    "adaptive-trial-simulator",
    "adaptyv",
    "adme-property-predictor",
    "aim-and-hypothesis-designer",
    "anatomy-quiz-master",
    "animal-and-cell-validation-planner",
    "anki-card-creator",
    "anndata",
    "arboreto",
    "arxiv-database",
    "arxiv-preflight",
    "author-response-builder",
    "automated-soap-note-generator",
    "basic-discovery-translational-opportunity-finder",
    "benchling-integration",
    "bidirectional-multi-phenotype-mr-research-planner",
    "bio-causal-genomics-mediation-analysis",
    "bio-causal-genomics-pleiotropy-detection",
    "biodbnet-api",
    "biogrid-orcs",
    "bioinformatics-translational-opportunity-finder",
    "biomarker-landscape-scanner",
    "biomed-outline-generator",
    "biomedical-search-strategy-builder",
    "biopython",
    "biopython-alignment",
    "biorxiv-database",
    "bioservices",
    "biotech-pitch-deck-narrative",
    "blind-review-sanitizer",
    "brenda-database",
    "bulk-omics-integrative-planner",
    "case-control-study-planner",
    "cellosaurus-api",
    "cellxgene-census",
    "chart-style-unifier",
    "chea-api",
    "chembl-database",
    "chemical-storage-sorter",
    "citation-management",
    "claim-strength-calibrator",
    "clinic-sample-size",
    "clinical-cohort-protocol-designer",
    "clinical-diagnostic-reasoning",
    "clinical-question-clarifier",
    "clinical-study-info-extractor",
    "clinicaltrials-database",
    "clinicaltrials-db",
    "clinicaltrials-gov-parser",
    "clinvar-database",
    "co-tank-monitor",
    "cobrapy",
    "cold-chain-risk-calculator",
    "comorbidity-common-immune-biomarker-research-planner",
    "comparative-network-toxicology-shared-mechanism-reference-grounded",
    "competitor-trial-monitor",
    "concept-explainer",
    "conference-abstract-adaptor",
    "conference-abstract-writer",
    "conference-poster-pitch",
    "conflict-of-interest-checker",
    "confounder-and-bias-control-planner",
    "consistency-checker-across-manuscript",
    "contradictory-findings-resolver",
    "conventional-non-oncology-hub-gene-research-planner",
    "conventional-oncology-hub-gene-research-planner",
    "cosmic-database",
    "cover-letter-drafter",
    "cross-disease-shared-biomarker-network-research-planner",
    "crossref-database",
    "ctd-api",
    "d-molecule-ray-tracer",
    "data-stats-analysis",
    "data-transform",
    "date-calculator",
    "dei-statement-drafter",
    "discussion-composer",
    "disease-mechanism-evidence-map",
    "docx-feedback-tracker",
    "dpi-upscaler-checker",
    "drug-repurposing-study-planner",
    "drug-target-evidence-landscape",
    "drugbank-database",
    "dual-disease-shared-transcriptome-biomarker-research-planner",
    "dual-disease-transcriptomic-ml-planner",
    "ebm-calculator",
    "ectd-xml-compiler",
    "ena-database",
    "encode-api",
    "encori-api",
    "endpoint-definition-designer",
    "ensembl-database",
    "epidemiology",
    "equipment-maintenance-log",
    "esm",
    "etetoolkit",
    "evidence-level-ranker",
    "experiment-design",
    "experimental-data-analysis",
    "expert-interview-generator",
    "expert-interview-topics",
    "facs-gating-viz-style",
    "faers-multi-drug-soc-planner",
    "faers-pharmacovigilance-disproportionality-research-planner",
    "faq-generator",
    "feasibility-aware-study-planner",
    "figure-first-paper-reader",
    "figure-legend-gen",
    "figure-legend-writer",
    "figure-reference-checker",
    "file-security-toolkit",
    "flowio",
    "fulltext-fetcher",
    "gene-database",
    "gene-info",
    "gene-structure-mapper",
    "generic-phenotype-scoring-research-planner",
    "geniml",
    "geopandas",
    "gget",
    "grant-budget-justification",
    "grant-gantt-chart-gen",
    "grant-mock-reviewer",
    "grant-proposal-assistant",
    "grant-specific-aims-writer",
    "graphical-abstract-generator",
    "gtars",
    "heatmap-beautifier",
    "hgnc-api",
    "high-value-paper-screener",
    "histolab",
    "hmdb-database",
    "hypogenic",
    "iacuc-protocol-drafter",
    "ib-summarizer",
    "image-processing",
    "inclusion-exclusion-criteria-builder",
    "inplasy-registration-helper",
    "introduction-logic-builder",
    "introduction-section-writer",
    "jaspar-api",
    "journal-club-presenter",
    "journal-recommender",
    "kegg-database",
    "keyword-velocity-tracker",
    "lab-budget-forecaster",
    "lab-inventory-predictor",
    "lab-prep-calculations",
    "labarchive-integration",
    "latex-manuscript-format-converter",
    "lay-press-release-writer",
    "lay-summary-for-cross-disciplinary-teams",
    "lay-summary-gen",
    "limitation-and-risk-writer",
    "lipinski-rule-filter",
    "literature-close-read",
    "literature-experiment-extract",
    "literature-extensive-read",
    "literatureimages-interpretation",
    "market-access-value",
    "markitdown",
    "matchms",
    "mechanism-flowchart",
    "mechanism-to-validation-planner",
    "medical-case-interpreter",
    "medical-case-report-generator",
    "medical-cv-resume-builder",
    "medical-device-mdr-auditor",
    "medical-email-polisher",
    "medical-english-precision-editor",
    "medical-imaging-review",
    "medical-research-algorithm-matcher",
    "medical-research-gap-finder",
    "medical-research-gap-to-study-planner",
    "medical-research-literature-reader-pro",
    "medical-topic-saturation-and-whitespace-checker",
    "medical-translation",
    "medical-unit-converter",
    "medical-vector-search",
    "medication-adherence-message-gen",
    "medication-reconciliation",
    "meeting-minutes",
    "mendelian-randomization-protocol-designer",
    "meta-analysis-methods-generator",
    "meta-baseline-generator",
    "meta-baujat-plot",
    "meta-criteria-generator",
    "meta-feasibility-analyzer",
    "meta-forest-binary-plot",
    "meta-forest-continuous-plot",
    "meta-forest-model-plot",
    "meta-funnel-plot",
    "meta-picos-generator",
    "meta-protocol-writer",
    "meta-radial-plot",
    "meta-results-forest-plot-analyzer",
    "meta-results-funnel-plot-generator",
    "meta-results-risk-of-bias",
    "meta-results-sensitivity-analysis",
    "meta-rob-plot",
    "meta-search-builder",
    "meta-sensitivity-plot",
    "meta-title-generator",
    "method-gap-detector",
    "methodology-extractor",
    "microbiome-diversity-reporter",
    "microscopy-scale-bar-adder",
    "mindmap",
    "mindmap-helper",
    "moa-explainer",
    "motif-logo-generator",
    "mr-scrna-research-planner",
    "multi-database-literature-collector",
    "multi-omics-clinical-integration-planner",
    "multi-panel-figure-assembler",
    "network-tox-docking-research-planner",
    "networking-email-drafter",
    "neurokit",
    "neuropixels-analysis",
    "nhanes-clinical-retrospective-biomarker-research-planner",
    "nih-biosketch-builder",
    "non-tumor-mechanism-guided-diagnostic-ml-research-planner",
    "non-tumor-ml-research-planner",
    "novelty-vs-feasibility-assessor",
    "nsfc-grant-writer",
    "open-targets-db",
    "openalex-db",
    "outcome-extraction-for-clinical-trials",
    "outlier-detection-handler",
    "paper-to-claim-verifier",
    "patent-assistant",
    "pathway-introduction-expert",
    "patient-recruitment-ad-gen",
    "pcd-immune-oncology-research-planner",
    "pdb-database",
    "pdf-extract-experimental-materials",
    "pdf-ppt",
    "peer-review",
    "peer-review-response-drafter",
    "phenotype-introduction",
    "plotly",
    "pmc-official-download",
    "population-gap-detector",
    "poster-designer",
    "poster-layout-planner",
    "poster-storyline-builder",
    "pptx-posters",
    "preclinical-pkpd-analyst",
    "presentation-hook",
    "primary-plan-recommender",
    "process-related-diagnostic-biomarker-nomogram-research-planner",
    "prognostic-biomarker-protocol-designer",
    "prospero-registration-helper",
    "protocol-deviation-classifier",
    "protocol-standardization",
    "pubchem-database-skill",
    "pubmed-database",
    "pubmed-search-specialist",
    "pubmed-topic-recommend",
    "pydeseq",
    "pyopenms-skill",
    "pytdc",
    "q-and-a-prep-partner",
    "qtl-colocalization-study-planner",
    "reagent-expiry-alert",
    "real-world-evidence-study-designer",
    "rebuttal-letter-strategist",
    "recommendation-letter-assistant",
    "reference-finder",
    "reference-integrity-checker",
    "reference-retrieval-skill",
    "reference-style-sync",
    "referral-letter-generator",
    "regulatory-submission",
    "reporting-guideline-compliance-checker",
    "reproducibility-check",
    "research-article-weekly",
    "research-hotspot-analysis",
    "residency-interview-prep",
    "result-reliability-checker",
    "results-section-structurer",
    "results-section-writer",
    "retraction-watcher",
    "revision-strategy-planner",
    "sample-size-and-power-planning-assistant",
    "sanger-chromatogram-qa",
    "sci-paper-reviewer",
    "science-popularization-article",
    "scientific-podcast-summary",
    "scientific-schematics",
    "scikit-bio",
    "scikit-survival",
    "scite-database",
    "scvi-tools",
    "sds-msds-risk-scanner",
    "seaborn",
    "search-pubmed",
    "semantic-consistency-auditor",
    "semantic-scholar-database",
    "sequence-alignment",
    "shift-handover-summarizer",
    "single-cell-research-planner",
    "single-compound-network-toxicology-disease-link-reference-grounded",
    "single-drug-adverse-effect-hub-first-network-pharmacology",
    "single-drug-adverse-effect-pathway-anchored-network-pharmacology",
    "single-drug-faers-safety-profile-research-planner",
    "single-gene-oncology-reference-grounded-research-planner",
    "singlecell-portal",
    "slide-deck-for-lab-meeting",
    "smart-journal-monitor",
    "spreadsheet-ops",
    "statistical-analysis-advisor",
    "study-design-identifier",
    "study-design-scale-selector",
    "study-limitations-drafter",
    "study-objective-refiner",
    "style-journal-rewrite",
    "systematic-review",
    "table-1-generator",
    "table-1-generator-advanced",
    "table-narrative-writer",
    "text-to-technical-roadmap",
    "title-and-abstract-optimizer",
    "tooluniverse-clinical-trial-matching",
    "tooluniverse-literature-deep-research",
    "topic-evidence-mapper",
    "torchdrug-english",
    "toxicity-structure-alert",
    "translational-gap-analyzer",
    "translational-study-blueprint",
    "treatment-response-predictor-planner",
    "tumor-immune-infiltration-diagnostic-ml-research-planner",
    "two-sample-mr-exposure-screening-reference-grounded",
    "two-sample-mr-research-planner",
    "uniprot-database",
    "unmet-clinical-need-extractor",
    "upset-plot-converter",
    "validation-strategy-designer",
    "variant-pathogenicity-predictor",
    "vector-text-fixer",
    "virtual-patient-roleplay",
    "visual-content-desc",
    "waste-disposal-guide",
    "zinc-database",
  ];
  retainedIds.push(
    "article-format-adjustment",
    "bianque",
    "bibliography",
    "comparison-table-gen",
    "content-proofreading",
    "find-paper-references",
    "hippocrates",
    "journal-skills",
    "knowledge-base-search",
    "latex-posters",
    "literature-filtering",
    "pdf-extract",
    "phi-prompt-guard",
    "phylogenetic-tree-styler",
    "research-paper-downloader",
    "result-figure-consistencycheck",
    "sample-group-sankey-plot",
    "systematic-review-screener",
    "volcano-plot-script",
  );
  const selectedIds = selected.map(({ id }) => id).sort();
  assert.equal(selected.length, 392);
  const completeSnapshots = [
    "basic-research-design",
    "cover-letter-generator",
    "meta-abstract-screener",
    "meta-screening-fulltext",
  ];
  for (const id of completeSnapshots) {
    assert.equal(
      selected.find((entry) => entry.id === id)?.sourceCommit,
      "d915031495e1c755d272c3de817ee3fc012e8b7b",
      id,
    );
  }
  assert.ok(selectedIds.includes("baseline-extraction-for-clinical-trials"));
  assert.ok(selectedIds.includes("scientific-critical-thinking"));
  assert.ok(selectedIds.includes("discussion-section-architect"));
  const repaired = selected.find(({ id }) => id === "citation-network");
  assert.equal(
    repaired.sourceCommit,
    "63c61d38c6c4bba5128f98f0b225aa44e3fe748d",
  );
  assert.ok(
    selected
      .filter(({ id }) => id !== repaired.id && !completeSnapshots.includes(id))
      .every(({ sourceCommit }) => sourceCommit === config.source.commit),
  );
  assert.ok(selectedIds.includes("paper-lookup"));
  for (const id of retainedIds) assert.ok(selectedIds.includes(id), id);
  assert.ok(selected.every(({ version }) => version === "1.0.0"));
  assert.deepEqual(
    parseMetadataJson(bytes)
      .deferred.map((entry) => entry.id)
      .sort(),
    manifest.entries
      .filter((entry) => !selectedIds.includes(entry.id))
      .map((entry) => entry.id)
      .sort(),
  );
  const audit = parseMetadataJson(
    await readFile(new URL("../skills/source-audit.json", import.meta.url)),
  );
  const reviews = parseMetadataJson(
    await readFile(new URL("../skills/reviews.json", import.meta.url)),
  );
  assert.deepEqual(
    Object.entries(reviews)
      .filter(([, review]) => review.reviewedBy)
      .map(([key]) => key)
      .sort(),
    selectedIds.map((id) => `${id}@1.0.0`).sort(),
  );
  assert.equal(reviews["abstract-trimmer@1.0.0"].reviewedBy, "ewen-poch");
  assert.throws(
    () =>
      prepareCandidates(
        { entries: selectReleaseEntries(bytes, audit.entries, config.source) },
        {
          ...reviews,
          "abstract-trimmer@1.0.0": {
            ...reviews["abstract-trimmer@1.0.0"],
            reviewedBy: "",
          },
        },
        config,
        {},
      ),
    (error) => {
      assert.deepEqual(
        error.blockers.map(({ id, code }) => ({ id, code })),
        [{ id: "abstract-trimmer", code: "missing-review" }],
      );
      return true;
    },
  );
});

test("catalog CLI uses the explicit plan and fails the whole selected batch when review is missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skill-release-selection-"));
  try {
    const sourceDirectory = join(directory, "upstream");
    const inputDirectory = join(directory, "input");
    await mkdir(sourceDirectory);
    await mkdir(join(inputDirectory, "skills"), { recursive: true });
    const manifestBytes = await readFile(
      new URL("../skills/manifest.json", import.meta.url),
    );
    const manifest = parseMetadataJson(manifestBytes);
    const selected = manifest.entries.slice(0, 2);
    const inputCandidates = selected.map((e) => makeCandidate(e.id));
    for (const [index, entry] of selected.entries()) {
      await mkdir(join(sourceDirectory, entry.sourcePath), { recursive: true });
      await writeFile(
        join(sourceDirectory, entry.sourcePath, "SKILL.md"),
        inputCandidates[index].files[0].bytes,
      );
    }
    const license = Buffer.from("Test-only MIT evidence");
    await writeFile(join(sourceDirectory, "LICENSE"), license);
    const git = (args) =>
      execFileSync("git", ["-C", sourceDirectory, ...args], {
        encoding: "utf8",
      });
    git(["init", "--quiet"]);
    git(["add", "."]);
    git([
      "-c",
      "user.name=Test-only fixture",
      "-c",
      "user.email=fixture@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "test fixture",
    ]);
    const source = {
      repository: "https://github.com/test/source",
      commit: git(["rev-parse", "HEAD"]).trim(),
    };
    const config = {
      initialVersion: "1.0.0",
      source,
      publisher: inputCandidates[0].skill.publisher,
    };
    await writeFile(
      join(inputDirectory, "marketplace.config.json"),
      metadataJsonBytes(config),
    );
    await writeFile(
      join(inputDirectory, "skills/manifest.json"),
      manifestBytes,
    );
    await writeFile(
      join(inputDirectory, "skills/inclusion-list.md"),
      await readFile(new URL("../skills/inclusion-list.md", import.meta.url)),
    );
    await writeFile(
      join(inputDirectory, "skills/release_plan.json"),
      metadataJsonBytes({
        schemaVersion: 1,
        source,
        selected: selected.map(identity),
        deferred: manifest.entries.slice(2).map((e) => ({
          ...identity(e),
          reason: "Excluded from synthetic CLI fixture",
        })),
      }),
    );
    const reviews = Object.fromEntries(
      selected.map((e, i) => [
        `${e.id}@${e.version}`,
        {
          sourceCommit: source.commit,
          contentSha256: contentDigest(inputCandidates[i].files),
          reviewedBy: "Test-only reviewer",
          reviewedOn: "2026-09-12",
          licenseExpression: "MIT",
          licenseFiles: [{ path: "LICENSE", sha256: sha256(license) }],
        },
      ]),
    );
    await writeFile(
      join(inputDirectory, "skills/reviews.json"),
      metadataJsonBytes(reviews),
    );
    const command = fileURLToPath(
      new URL("../scripts/build-catalog.mjs", import.meta.url),
    );
    const run = (output) =>
      spawnSync(
        process.execPath,
        [command, "--source", sourceDirectory, "--output", output],
        { cwd: inputDirectory, encoding: "utf8" },
      );
    reviews[`${manifest.entries[2].id}@${manifest.entries[2].version}`] = {
      additionalLicenseFiles: [{ sha256: "invalid deferred input" }],
    };
    const supplemental = Buffer.from("Third-party fixture notice\r\n");
    const digest = sha256(supplemental);
    reviews[`${selected[0].id}@${selected[0].version}`].additionalLicenseFiles =
      [
        {
          source: {
            repository: "https://github.com/independent/skills",
            commit: "c".repeat(40),
            path: "LICENSE.md",
          },
          sha256: digest,
        },
      ];
    await writeFile(
      join(inputDirectory, "skills/reviews.json"),
      metadataJsonBytes(reviews),
    );
    const missing = run(join(directory, "missing-copy"));
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /ENOENT/);
    await mkdir(join(inputDirectory, "licenses"));
    await writeFile(
      join(inputDirectory, "licenses", `${digest}.txt`),
      supplemental,
    );
    const output = join(directory, "candidate");
    const success = run(output);
    assert.equal(success.status, 0, success.stderr);
    const built = await readBundle(output);
    assertReleaseSelection(built.root, selected, source);
    assert.equal(built.root.skills.length, 2);
    const detail = JSON.parse(
      built.objects.get(
        built.root.skills.find((skill) => skill.id === selected[0].id).release
          .path,
      ),
    );
    assert.equal(detail.skill.license.evidence.at(-1).sha256, digest);
    assert.match(
      detail.skill.license.evidence.at(-1).url,
      /github.com\/independent\/skills\/blob/,
    );
    delete reviews[`${selected[0].id}@${selected[0].version}`];
    await writeFile(
      join(inputDirectory, "skills/reviews.json"),
      metadataJsonBytes(reviews),
    );
    const failedOutput = join(directory, "blocked");
    const failure = run(failedOutput);
    assert.notEqual(failure.status, 0);
    const report = parseMetadataJson(
      await readFile(join(failedOutput, "publication-blockers.json")),
    );
    assert.deepEqual(
      report.blockers.map((b) => [b.id, b.code]),
      [[selected[0].id, "missing-review"]],
    );
    await assert.rejects(readFile(join(failedOutput, "marketplace.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
