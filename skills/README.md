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
and commit. Every entry identifies an exact `id` and package `version`; each
deferred entry also requires a nonblank `reason`. The current release selects
121 reviewed Skills, retaining all 21 previously published members and adding
100 members at `1.0.0`. The other 463 members remain explicitly deferred.
Of these, 450 await review for a later batch, including six entries with missing
documented package files and 29 entries with asset or attribution follow-ups. The original 13
deferrals remain: 11 with remaining source errors, `pptx-skill`
with conflicting bundled license terms, and `paper-tweet-generator` with an
independent CC BY-NC-ND 4.0 notice in its bundled article text. The latter notice
appears in [`extracted_text.txt:117`](https://github.com/aipoch/medical-research-skills/blob/d92441066ea6259967469be8e0c8c7b6587928ab/scientific-skills/Other/paper-tweet-generator/extracted_text.txt#L117);
its redistribution review and permission resolution remain pending.
Selection is not a redistribution approval.

To defer another member, move its exact ID/version from `selected` to `deferred`
and record the reason. To include a corrected member later, update the reviewed
source baseline and evidence as needed, then move it back to `selected`. Keep
all other members accounted for. Unknown or stale versions, source mismatch,
duplicates, overlaps, missing decisions, empty selections and unsupported fields
fail validation. Run `npm run validate` after editing the plan.

The complete source audit remains reproducible, including findings for deferred
members. Build and publication use the same selection validator. Before signing,
the current listings must match the selected IDs, versions and source paths
exactly. A selected member's missing review or source error still blocks the
whole batch. No license or runtime approval is inferred from a deferral reason.

Only selected members appear in current Marketplace discovery. If a later plan
defers a previously published member, its immutable release descriptors and
shards remain in the signed history index; this does not uninstall or change the
state of an installed Skill. For initial deferrals, no descriptor is generated.

This file is repository publication configuration, not an App model or new public
protocol field. No App state enum, database field or historical-data migration is
added. Public signatures and digests still cover their original bytes.

## Review records

`reviews.json` retains the initial redistribution review for
`abstract-trimmer@1.0.0`, recorded by `ewen-poch` on 2026-09-12, and contains 120
static package and license reviews recorded by `Codex` on 2026-09-13 across the
maintainer-authorized 20-member and 100-member batches. These reviews cover the pinned package inventory,
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
retention of required notices. Evidence must be bounded regular files from the
same pinned source commit; the builder checks their hashes. A repository-root
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
