# Third-party submission review queue

This directory records the 192 non-AIPOCH source records selected in
`open-science-skills-20260911.zip` (SHA-256
`c8ac63eecc2b1fb2e712aba667be51c829faf7db9d5124853500a1f7db2c3146`).
The archive is an intake-selection input, not a publication artifact or source
of authority. Every release config points to an immutable upstream GitHub commit
and path. Skill payloads and archive-added evaluation files are not committed.

| Provider           | Records | Blocked: missing Skill license | Runtime-ID collision | License-policy review |
| ------------------ | ------: | -----------------------------: | -------------------: | --------------------: |
| Google DeepMind    |       7 |                              7 |                    6 |                     0 |
| K-Dense AI         |      56 |                              2 |                   48 |                    27 |
| NVIDIA BioNeMo     |      31 |                              6 |                   25 |                    14 |
| Synthetic Sciences |      78 |                             14 |                   64 |                    63 |
| Yuan1z0825         |      20 |                             17 |                    0 |                     0 |
| **Total**          | **192** |                         **46** |              **143** |               **104** |

There are 130 unique runtime Skill IDs. All release configs use authoring v1.
Provider identity and the provider-qualified candidate key exist only in this
queue index. Intake review records continue using `<skill-id>@<version>`; inspect
same-name alternatives in separate invocations and files. Queue keys do not change
public App runtime IDs or authorize replacing existing sources. The production
register rejects IDs occupied by selected original members or existing
registrations. Never-published, deferred IDs may explicitly select a reviewed
source. Signed release history prevents replacing a published ID's repository or
directory; the historical manifest and its original-source deferrals remain intact.

Categories for records sharing an ID with the historical catalog reuse that
catalog category. Categories for the 51 new Nature and NVIDIA IDs are proposed
review metadata: Nature research-reading/search skills use `Evidence Insight`,
writing/presentation skills use `Academic Writing`, statistics/data skills use
`Data Analysis`, and shared/logging utilities use `Other`; NVIDIA computational
tools use `Data Analysis`, multi-step discovery workflows use `Protocol Design`,
and setup/monitoring utilities use `Other`. Category acceptance remains part of
maintainer review.

Local source-package inspection accepted 146 records and reproduced the 46
documented missing-license failures with no additional package errors. This does
not replace verification against each declared Git commit, legal review, source
ownership review, security review, content review or client compatibility tests.
No `reviewed_by`, approval date, signature, catalog membership or publication
state is recorded here.

The index retains intake observations; production approval is recorded separately
in `skills/reviews.json` and `authoring/production.json`. The 25 NVIDIA entries
with per-Skill license declarations are now explicitly registered there. Their
IDs are occupied in production and therefore carry the collision constraint for
any further registration. Existing license-policy flags remain traceable; the 14
combined-license expressions have package-specific review exceptions, with both
license texts and NVIDIA attribution retained. No global allowlist is expanded.

The three Nature entries declaring MIT (`nature-experiment-log`,
`nature-literature-pipeline`, `researchwrite`) remain unregistered: their selected
`LICENSE` evidence at the pinned commit contains Apache-2.0 rather than a complete
MIT grant. Resolve this evidence mismatch before production review.

Eleven never-published IDs now select K-Dense at
`36d8f13a1e754618794bf42f417884940077b4ae`: `clinical-decision-support`,
`clinical-reports`, `dnanexus-integration`, `literature-review`, `pathml`,
`pydicom`, `pysam`, `scholar-evaluation`, `shap`, `statistical-analysis` and
`treatment-plans`. Their Skill MIT declarations match the complete K-Dense MIT
notice retained in each package. The two literal `MIT license` declarations have
package-specific exceptions. All eleven preserve the declared `K-Dense Inc.`
author; none supplies a Marketplace evaluation. Imported scripts were inspected
statically, not executed; scientific dependencies and external service credentials
remain runtime prerequisites.

All 44 K-Dense/Synthetic alternatives for the 25 previously unpublished IDs were
inspected at their configured commits. Fourteen IDs remain unregistered:

| IDs                                                                                                                         | Unresolved evidence at the pinned sources                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clinpgx-database`, `fda-database`, `gwas-database`, `metabolomics-workbench-database`, `string-database`, `uspto-database` | Synthetic declares `Unknown`; the Google `string-database` alternative has no per-Skill license.                                                                                                                                               |
| `datamol`, `lamindb`                                                                                                        | K-Dense declares Apache-2.0 but supplies a root MIT notice. Synthetic supplies Apache-2.0, but shared or substantially overlapping K-Dense reference files lack corresponding K-Dense attribution; resolve provenance and license scope first. |
| `deeptools`                                                                                                                 | Ambiguous `BSD license` declaration with MIT (K-Dense) or Apache-2.0 (Synthetic) evidence.                                                                                                                                                     |
| `matplotlib`                                                                                                                | Per-Skill license points to an unpinned external license directory; selected root evidence does not establish the declared license scope.                                                                                                      |
| `pyhealth`                                                                                                                  | K-Dense lacks a per-Skill declaration; Synthetic declares MIT while supplying Apache-2.0 evidence.                                                                                                                                             |
| `rowan`                                                                                                                     | Both variants declare proprietary API terms without a corresponding content redistribution grant.                                                                                                                                              |
| `scanpy`                                                                                                                    | K-Dense declares BSD-3-Clause but supplies MIT evidence; Synthetic declares the unresolved literal `SD-3-Clause license` and supplies Apache-2.0.                                                                                              |
| `venue-templates`                                                                                                           | K-Dense includes Elsevier LPPL bibliography/style templates beyond its root MIT notice; complete applicable license evidence is missing. Synthetic lacks a per-Skill declaration.                                                              |

These are source-review observations, not a finding that the upstream software is
unusable or a new publication-state enum. The original missing-license and policy
flags remain intake observations. No unresolved member is renamed, truncated or
implicitly approved to increase the publication count.
