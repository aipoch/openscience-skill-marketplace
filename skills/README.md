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
  fields. They require reviewed correction or explicit omission; no alias or
  maximum score is guessed.
- Four YAML syntax failures: format-references-endnote, format-references-zotero,
  meta-analysis, and bioinfo-analysis-plan.
- One additional required-field failure: mendelian-randomisation has no valid description.
- Five missing license declarations: elastic-net-feature-selection,
  hierarchical-clustering-plot, lasso-logistics-analysis,
  roc-diagnostic-performance, and univariate-multivariable-cox-regression.
- ppi-network-analysis totals 196,438,143 bytes; its STRING links files are
  84,569,998 and 72,718,210 bytes. They exceed the App's 128 MiB Skill and 50 MiB
  file limits. The Skill depends on these offline assets; they are not removed.

All members stay in the manifest. Neither the build nor publication silently
skips a blocked member, substitutes a license, repairs YAML, or truncates data.
Upstream content fixes and any PPI packaging redesign require separate approval.

Each manifest entry starts at the approved `1.0.0` package version. A later change
can bump that entry's version without bumping the entire catalog. The fixed source
baseline is deliberate; changing it requires re-auditing provenance and reviews.

## Review records

`reviews.json` is deliberately empty. Each future key is `<skill-id>@<version>`
and must record the following reviewed facts (the example is not an approval):

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

The ordinary license policy accepts MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
ISC and CC0-1.0 only after review. Other terms require a nonempty reviewed
`exception_reason`, retained in the descriptor. A changed package digest invalidates
its review. Invalid YAML or missing declarations still fail independently.

Optional assessments can be explicitly omitted with a nonempty per-version
`omit_evaluation_reason` in the byte-bound review record. This waives only assessment
findings; it never waives YAML, license or resource failures. The source audit still
retains the findings. No score field or zero placeholder is emitted.

Missing author credits remain absent. `evaluation` is omitted when unavailable;
its raw final score is never recomputed, rounded or replaced with zero. The
assessment's tool version is separate from a reported assessed Skill version.

Categories describe browsing metadata. Historical inclusion tiers remain only in
`inclusion-list.md`; active manifests, audits and published metadata omit them.
Categories do not introduce
an installation state, automatic activation, sandbox policy or safety endorsement.
