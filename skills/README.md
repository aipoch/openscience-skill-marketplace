# Catalog inputs and publication gates

`inclusion-list.md` is the supplied authoritative decision document. Its original
bytes are preserved; `manifest.json` binds them with SHA-256 and resolves all 584
members to exact source directories and independent package versions. Source repository and commit live in
`marketplace.config.json`. IDs are independent of the category directory.

`source-audit.json` is reproducible observation, not legal or safety approval.
It records descriptions, declared licenses, available author credits, optional
upstream assessments, file counts, sizes, and blockers from the fixed commit.
The source ZIP and mutable upstream main are not membership or content inputs.

Categories preserve the authoritative heading values verbatim: `Academic Writing`,
`Data Analysis`, `Evidence Insight`, `Protocol Design`, and `Other`. These are the
App's category values, not slugs; display translation belongs to the App. The raw
list's historical inclusion tiers do not produce Marketplace fields or installation,
sandbox or disabled states.

## Current evidence

- 584 unique members: 443 scientific-skills and 141 awesome-med-research-skills.
- 19,761 files; 510,768,301 bytes before sharding.
- 566 identity-matched, numerically valid upstream self-assessments at the pinned
  commit, including both `eval_report_*.json` and versioned `*_audit_result_*.json`
  files. The older ZIP's 141 reports are a different snapshot.
- Seventeen additional reports are not mapped: twelve have a different reported
  Skill identity and five lack the required original `final.score/final.max`
  fields. Their explicit omission decisions are recorded in `reviews.json`; no
  alias or maximum score is guessed. Original reports remain in the packages.
- Four YAML syntax failures: format-references-endnote, format-references-zotero,
  meta-analysis, and bioinfo-analysis-plan.
- One additional required-field failure: mendelian-randomisation has no valid description.
- Five missing license declarations: elastic-net-feature-selection,
  hierarchical-clustering-plot, lasso-logistics-analysis,
  roc-diagnostic-performance, and univariate-multivariable-cox-regression.
- ppi-network-analysis totals 196,438,143 bytes; its STRING links files are
  84,569,998 and 72,718,210 bytes. They exceed the App's 128 MiB Skill and 50 MiB
  file limits. The Skill depends on these offline assets; they are not removed.

All members stay in the manifest and raw source audit. The release plan below
explicitly controls which members enter the current publication. Every selected
member must pass all gates; failures are never silently skipped. The builder does
not substitute a license, repair YAML, or truncate data.
Upstream content fixes and any PPI packaging redesign require separate approval.

Each manifest entry starts at the approved `1.0.0` package version. A later change
can bump that entry's version without bumping the entire catalog. The fixed source
baseline is deliberate; changing it requires re-auditing provenance and reviews.

## Release selection

[release_plan.json](release_plan.json), validated by
[release_plan.schema.json](release_plan.schema.json), partitions all manifest
members into `selected` and `deferred` entries at the configured source repository
and default commit. Every entry identifies an exact `id` and package `version`; each
deferred entry also requires a nonblank `reason`. The current release selects
465 original Skills plus 60 provider releases, for 525 installable Skills. The
current batch adds 72 previously evidence-pending IDs under maintainer-authorized
`Unknown` license exceptions. Each review records the unresolved materials,
retains the exact original license declaration and bytes, and binds the source
commit, content digest and available evidence. `hierarchical-clustering-plot`
uses provider intake because SKILL.md has no license field; its DESCRIPTION MIT
statement is retained as evidence. `nature-academic-search` also uses the existing
provider Unknown path. `resubmission-deadline-tracker` pins the repaired Medical
commit `63c61d38c6c4bba5128f98f0b225aa44e3fe748d`; other new original entries use
the default snapshot. Identity-mismatched assessments are omitted from the
catalog while their source files remain in the ZIP.

The other 119 original members remain explicitly deferred, including alternate
provider sources for already published IDs. Seven candidates in this batch remain
unselected: `bio-ontology-mapper`, `icd10-cpt-coding-assistant`, `gokegg-analysis`
and `cibersort-immune-infiltration-analysis` require applicable distribution terms;
`ppt` and `ppt-master` contain Python syntax defects; `open-source-license-check`
mislabels Bowtie 2 as MIT/non-copyleft. Their concrete reasons remain in the release
plan. Unknown exceptions do not resolve explicit restrictions or executable defects.
AlphaFold and bibliography repairs remain deferred to upstream maintenance.

All 453 preceding releases remain immutable. No upstream files are changed or
removed, and no evaluated version or independent safety approval is inferred.
Earlier findings in [the original-list review](../docs/original-list-review.md)
remain historical observations; the current release plan and review records carry
the explicit maintainer decisions for this batch.

The previous batch resolved two missing-reference deferrals without adding
invented files. `citation-network` pins upstream commit
`63c61d38c6c4bba5128f98f0b225aa44e3fe748d`, which escapes inline HTML payloads;
its absent `references/README.md` is additional documentation unused by the
workflow. HTML uses an unversioned external vis-network CDN dependency; custom
GEXF output paths require the separate exporter's `--input` option.
`discussion-section-architect` stays on the default commit: its drafting and
revision workflow is complete in SKILL.md. Its absent guide/examples are
supplementary; the Python helper produces generic outlines and transition phrases,
not a personalized interpretation of `--findings`. The agent must ground prose
in the supplied results and literature. The original self-assessments remain
90/100 and 91/100 respectively; no evaluated Skill version or independent safety
approval is inferred. Detailed working notes remain local; exact release approvals
are bound to source, content and license hashes in `reviews.json`.

The preceding two-member batch stays on the default source commit. For
`baseline-extraction-for-clinical-trials`, the full-text extraction path includes
all ten schema fields and the PDF text helper. Its PMID-only lookup helper is
absent; that shortcut is unavailable, and full article text is required for the
documented fallback. PDF extraction requires the separately installed PyPDF2
library and does not perform OCR. For `scientific-critical-thinking`, the complete
textual appraisal workflow and all six references are present. Its schematic
command belongs to the separately installed `scientific-schematics` Skill;
diagram generation is not bundled with this package. The six references match
K-Dense's fixed original snapshot byte for byte, and the workflow body differs
only in aggregation metadata and the appended input-validation section. The
original K-Dense MIT copyright notice is included alongside AIPOCH's notice.
These static reviews do not certify clinical decisions, runtime behavior or the
upstream self-assessments. Missing optional helpers are not reconstructed.

The preceding four-member batch pins the complete upstream snapshot
`d915031495e1c755d272c3de817ee3fc012e8b7b`; their required templates and prompts
were removed in the default snapshot. These are first Marketplace releases of
previously deferred members, not replacements for published content.

- `cover-letter-generator` includes its letter template and writing checklist.
  Originality, author approval and submission declarations require user confirmation.
- `basic-research-design` includes both subtitle and experimental-outline prompts.
  Outputs are proposed research plans, not validated experimental findings.
- `meta-abstract-screener` includes both screening prompts and its optional JSON
  validator. The validator accepts a JSON positional argument, not `--help`; it
  checks required fields and enum values, not exact keys or decision correctness.
  The agent must enforce the documented two-field output and screening criteria.
- `meta-screening-fulltext` includes the screening prompts and PDF text extractor.
  Full text is required; the absent optional `query_pubmed.py` helper cannot be
  used. PDF extraction needs separately installed PyPDF2 and does not perform OCR.

The source self-assessments retain final scores of 87/100, 87/100, 86/100 and
85/100 respectively, together with their distinct static and dynamic scores.
Their report URLs point to the selected commit; no evaluated Skill version or
independent safety endorsement is inferred. Static inspection does not certify
runtime behavior or systematic-review decisions. Upstream files remain unmodified.

The next batch adds two documentation-driven research planning Skills:

- `hypothesis-generation` pins `d915031495e1c755d272c3de817ee3fc012e8b7b`.
  Its three reference guides, LaTeX template, style file and formatting guide are
  present. The template and style match the original K-Dense snapshot after line
  ending normalization for review only; the packaged source bytes are unchanged.
  Reports need XeLaTeX/LuaLaTeX, BibTeX, user-supplied evidence and a separately
  installed `scientific-schematics` Skill. Figures and the bibliography are output
  inputs created for the report, not missing bundled research data.
- `research-grants` stays at the default source commit. Its five agency guides,
  specific-aims and broader-impact guides, reference index and three templates
  support the manual proposal-drafting path. Five advertised supplementary guides
  (`budget_preparation`, `review_criteria`, `timeline_planning`, `team_building`,
  `resubmission_strategies`) and the optional compliance, budget and deadline
  scripts are absent. Automated checking is unavailable. Read the actual current
  solicitation and institutional requirements before using the historical agency
  guidance; illustrative budgets and sample proposals are not real applications
  or current funding/compliance guarantees. Schematics require the separate Skill.

Both original K-Dense Skill declarations explicitly identify MIT. The aggregation
contains rewritten prose, so original-copy equivalence is not claimed beyond the
normalized LaTeX template/style comparison. The exact aggregated payload remains
authenticated and unchanged. Admission does not endorse the upstream assessments
or validate generated hypotheses, statistical plans, funding rules or submissions.

A selected member may specify `source_commit`, a lowercase 40-character commit
from that same repository. Its source path still comes from the original manifest.
Omitting the field uses the default commit; `sourceCommit` JSON, branch names,
repository/path overrides and overrides on deferred records are rejected.
The reading boundary resolves `source_commit` to internal `sourceCommit`; this
is format mapping, not a historical compatibility alias.

For an unpublished member with a reviewed complete upstream snapshot, move its ID/version to `selected`
with the reviewed commit in your local plan, fetch it, then generate review input:

```bash
node scripts/fetch-selected-sources.mjs --source /path/to/upstream
npm run review:input -- --source /path/to/upstream --id skill-id --license-path LICENSE
```

Review input uses the selected commit for both package bytes and license evidence.
Deferred members still use the default snapshot. Selection is only configuration:
building remains blocked until the exact commit, content digest and license
notices have complete approval. Never change a published ID/version's source;
the authenticated-history build rejects any change to its release or package.

To defer another member, remove any `source_commit`, move its exact ID/version from `selected` to `deferred`
and record the reason. To include a corrected member later, update the reviewed
per-member commit and evidence as needed, then move it back to `selected`. Keep
all other members accounted for. Unknown or stale versions, source mismatch,
duplicates, overlaps, missing decisions, empty selections and unsupported fields
fail validation. Run `npm run validate` after editing the plan.

The complete source audit remains reproducible, including findings for deferred
members. Build and publication use the same selection validator. Before signing,
the current listings must match the selected IDs, versions, resolved commits
and source paths exactly. A selected member's missing review or source error still blocks the
whole batch. No license or runtime approval is inferred from a deferral reason.

The combined catalog also includes explicitly registered, reviewed external
providers from `authoring/production.json`; their IDs cannot overlap this original
authority. See [provider publication](../authoring/README.md#production-and-batch-publication).

Only selected members appear in current Marketplace discovery. If a later plan
defers a previously published member, its immutable release descriptors and
shards remain in the signed history index; this does not uninstall or change the
state of an installed Skill. For initial deferrals, no descriptor is generated.

This file is repository publication configuration, not an App model or new public
protocol field. No App state enum, database field or historical-data migration is
added. Public signatures and digests still cover their original bytes.

## Review records

`reviews.json` retains the initial redistribution review for
`abstract-trimmer@1.0.0`, recorded by `ewen-poch` on 2026-09-12, and contains 393
static package and license reviews recorded by `Codex` on 2026-09-13 across the
maintainer-authorized 20-member batch, three 100-member batches, a 30-member batch, a 13-member batch, a 19-member batch, the K-Dense `paper-lookup` review, the repaired `citation-network` review, the `discussion-section-architect` review, the two-member extraction/appraisal intake, the four-member complete-snapshot intake and this two-member research-planning intake. These reviews cover the pinned package inventory,
source declarations, provenance-sensitive examples and required MIT notice. They
do not certify runtime behavior or provide independent safety endorsement.
The seventeen assessment-omission records remain separate; omission-only records
do not approve redistribution. All unreviewed members remain deferred.
Each key is `<skill-id>@<version>`; a complete redistribution review must record
the following facts (the example is not an approval):

```json
{
  "example@1.0.0": {
    "source_commit": "FULL_40_CHARACTER_COMMIT",
    "content_sha256": "REVIEWED_SKILL_CONTENT_SHA256",
    "reviewed_by": "Reviewer identity",
    "reviewed_on": "YYYY-MM-DD",
    "license_expression": "MIT",
    "license_files": [
      { "path": "path/to/license-evidence", "sha256": "EXACT_FILE_SHA256" }
    ]
  }
}
```

Obtain hashes and package metrics without creating an approval:

```bash
npm run review:input -- --source /path/to/upstream --id primary-plan-recommender \
  --license-path LICENSE
```

Review must cover redistribution of all package files, third-party assets and
retention of required notices. `license_files` evidence must be bounded regular files from the
same pinned content source commit; the builder checks their hashes. A repository-root
license is evidence to review, not automatic permission for third-party content.

The builder includes verified evidence outside the Skill source directory as
`LICENSES/<sha256>.txt`, preserving its original bytes. Evidence already inside
the Skill stays at its original path; identical external evidence is bundled
once. Generated paths must not collide with source files. Added notices count
toward all package limits and are covered by the final package and shard hashes.
The evidence URL and SHA-256 identify the original source and copied notice.

Review `content_sha256` binds the original source-directory files, while
`license_files` binds each additional evidence input. The release descriptor's
`package.content_sha256`, `file_count` and `uncompressed_bytes` describe the
complete distributed package, including added notices. No source files are
rewritten. Regenerate unpublished development artifacts after this packaging
change; existing immutable releases cannot be overwritten.

### Mixed-license package display

Keep `license_expression` equal to the exact upstream Skill declaration. For a
new package containing independently licensed components, a complete review may
add `package_license_expression`, such as `MIT AND CC-BY-4.0`, together with
`exception_reason` describing component scope and attribution. This optional
field accepts distinct license identifiers joined by `AND`, beginning with
the unchanged primary declaration; alternative expressions and replacement of
that declaration are rejected. It is an explicitly reviewed conjunction, not
a general SPDX expression parser or automatic permission inference.

At least two distinct hashed evidence files are required. Record the applicable
component files and notices in `license_files` / `additional_license_files`; all
existing source, content, evidence and reviewer checks still apply. The listing
license and detail `license.expression` display the complete package expression.
Original `SKILL.md`, attribution and notice bytes remain unchanged. Without this
field, existing review behavior and generated release bytes are unchanged.

For an explicitly authorized uncertainty exception, `package_license_expression`
may instead be exactly `Unknown`. `exception_reason` must identify the unresolved
source, license coverage or bundled materials and the maintainer decision. This
labels uncertainty; it does not grant rights or erase known restrictions. The
original `license_expression` must still match the source declaration, and the
same source, content, evidence and reviewer checks apply. Preserve every original
notice and file; a license uncertainty exception does not waive package defects.

This review-only field does not change the public protocol or App data model.
Previously published releases remain immutable; do not edit an existing release
to add terms.

### Original notices from another repository

Authors do not have to be AIPOCH. Review the actual content license and preserve
original credits independently of the configured Marketplace publisher. The
content source, original notice source and CDN distribution address are separate.

When a required original notice is missing from the aggregation snapshot, retain
a verified raw copy in `licenses/<sha256>.txt` in this repository and add optional
`additional_license_files` to the complete review:

```json
{
  "additional_license_files": [
    {
      "source": {
        "repository": "https://github.com/K-Dense-AI/scientific-agent-skills",
        "commit": "f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f",
        "path": "LICENSE.md"
      },
      "sha256": "09b02a3c9df3053c55531d503357a9c7cde275970e6c3ceaa1ddf5f0e90b40c1"
    }
  ]
}
```

Before recording this evidence, verify the original repository/commit/path,
compare the notice bytes and trace the covered content back to that source.
Commit the verbatim copy with its review record; do not reformat it. The builder
loads only selected reviews' copies, rejects missing, empty, oversized, symlinked
or hash-mismatched files, and bundles them through the same `LICENSES/` path and
collision/size checks. Duplicate notice bytes are packaged once. No network
fetch or guessed local path is used during the build.

The existing public `license.evidence` array carries each notice's original URL
and hash. No consumer update or historical migration is needed. Existing
id/version releases remain immutable; use this for newly reviewed releases.
Supplemental evidence does not override a conflicting declared license or waive
package/quality review. See [the retained notices](../licenses/README.md).

Provider intake accepts external content repositories but does not enroll them
in the production manifest. Its current contract requires notices in the
submitted source and rejects supplemental review fields explicitly. Production
admission remains a separate maintainer-reviewed selection decision.

The ordinary license policy accepts MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
ISC and CC0-1.0 only after review. Other terms require a nonempty reviewed
`exception_reason`, retained in the descriptor. A changed package digest invalidates
its review. Invalid YAML or missing declarations still fail independently.

Optional assessments can be explicitly omitted with a nonempty per-version
`omit_evaluation_reason` in the byte-bound review record. This waives only assessment
findings; it never waives YAML, license or resource failures. The source audit still
retains the findings and the original report bytes remain in the package. An
omission-only record has no `reviewed_by`, `reviewed_on`, `license_expression` or
`license_files`; it continues to produce a `missing-review` blocker. Complete
license review separately without replacing the approved content digest. Changed
source commits or package bytes require renewed review, including the omission
decision. No score field or zero placeholder is emitted.

Missing author credits remain absent. `evaluation` is omitted when unavailable;
its raw final score is never recomputed, rounded or replaced with zero. The
assessment's tool version is separate from a reported assessed Skill version.

Categories describe browsing metadata. Historical inclusion tiers remain only in
`inclusion-list.md`; active manifests, audits and published metadata omit them.
Categories do not introduce
an installation state, automatic activation, sandbox policy or safety endorsement.
