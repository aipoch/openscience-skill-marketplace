# Third-party submission review queue

This directory records the 192 non-AIPOCH source records selected in
`open-science-skills-20260911.zip` (SHA-256
`c8ac63eecc2b1fb2e712aba667be51c829faf7db9d5124853500a1f7db2c3146`).
The archive is an intake-selection input, not a publication artifact or source
of authority. Every release config points to an immutable upstream GitHub commit
and path. Skill payloads and archive-added evaluation files are not committed.

| Provider           | Records | Missing Skill license (intake) | Runtime-ID collision | License-policy review |
| ------------------ | ------: | -----------------------------: | -------------------: | --------------------: |
| Google DeepMind    |       7 |                              7 |                    7 |                     0 |
| K-Dense AI         |      56 |                              2 |                   53 |                    27 |
| NVIDIA BioNeMo     |      31 |                              6 |                   26 |                    14 |
| Synthetic Sciences |      78 |                             14 |                   75 |                    63 |
| Yuan1z0825         |      20 |                             17 |                    8 |                     0 |
| **Total**          | **192** |                         **46** |              **169** |               **104** |

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
`nature-literature-pipeline`, `researchwrite`) are now registered using their
specific `SKILL.md` declarations as primary evidence. The repository Apache-2.0
notice is retained as an upstream notice; it does not replace the MIT declarations.
Each declaration and notice is hashed at the fixed source commit.

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
inspected at their configured commits. Three IDs in that comparison remain
unregistered after the reviewed additions and original-source selections below:

| IDs               | Remaining issue at the pinned sources                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matplotlib`      | The declaration points to an external license directory rather than concrete terms retained at the Skill commit; the applicable evidence still needs to be pinned and packaged. |
| `rowan`           | The specific declaration is `Proprietary (API key required)`; it does not supply content redistribution terms.                                                                  |
| `venue-templates` | The MIT Skill includes separately licensed Elsevier LPPL bundle files; the applicable complete redistribution evidence remains unresolved.                                      |

`datamol`, `lamindb`, `scanpy` and `deeptools` now select the original K-Dense
source with `SKILL.md` as primary license evidence and the unchanged root MIT
notice retained for upstream attribution. Their exact declarations remain
`Apache-2.0 license`, `Apache-2.0 license`, `BSD-3-Clause` and `BSD license`.
The last label does not specify a BSD variant; no variant is inferred. A different
root notice alone is not a rejection reason or permission to replace a per-Skill
expression. These packages contain guides, examples and helpers; the scientific
libraries remain external dependencies.

These are source-review observations, not a finding that the upstream software is
unusable or a new publication-state enum. The original missing-license and policy
flags remain intake observations. No unresolved member is renamed, truncated or
implicitly approved to increase the publication count.

## Reviewed missing declarations

Eight entries now have explicit production reviews using `Unknown`: NVIDIA
`complexa-target`; K-Dense `pyhealth`; Google `string-database`; and Nature
`nature-citation`, `nature-downloader`, `nature-image2ppt`,
`nature-paper-to-patent`, `nature-ref-verifier`.

The original missing-license flags describe absent frontmatter at intake; they
are not current publication decisions. Intake now omits the undeclared expression
and requires an explicit `Unknown` review with verified redistribution evidence
and an explanation. Root notices are retained for the reviewed first-party
content. The Nature downloader, Image2PPT and incorporated patent-disclosure
material also retain their complete package-local MIT notices. No existing
license declaration is overridden, no author is inferred, and upstream evaluation
files remain ordinary payload files.

Remaining source-package issues include four Complexa commands referencing
unbundled `_shared` scripts; ten Nature routers requiring sibling `nature-shared`
resources; and `nature-shared` itself explicitly being a support-only package.
`nature-figure` additionally contains third-party notices documenting missing
redistribution grants for copied research figures. `nature-academic-search`
contains article-abstract fixtures whose redistribution scope remains unresolved.
The NVIDIA `cuequivariance` copy matches its referenced cuEquivariance source,
but its selected evidence omits that source's 2024 NVIDIA copyright notice.
These members remain outside production; neither source files nor dependency
layouts are rewritten to bypass the issue.

## Original sources for database copies

Five further PR #32 IDs select the intact original K-Dense directories at
`71add644263a56368f8680d68df504c6674dc1e5`: `clinpgx-database`, `fda-database`,
`gwas-database`, `metabolomics-workbench-database` and `uspto-database`.
This is the parent of the upstream commit that consolidated the individual
Skills into `database-lookup`. Every script and reference matches the selected
Synthetic Sciences copy byte-for-byte; the copied `SKILL.md` changes only the
category and author metadata. The Synthetic evidence does not retain the original
K-Dense MIT notice, so production uses the original directories, original
`K-Dense Inc.` attribution and complete `LICENSE.md` instead.

The five literal `Unknown` declarations remain unchanged and have explicit
package-specific evidence reviews. No source files are rewritten. The original
queue records still describe the submitted copies; the production register is
the authority for the selected original sources. No published ID changes its
source, and no additional runtime ID is introduced outside the PR #32 list.
External database access, endpoint availability, credentials and Python libraries
remain runtime prerequisites, not independently verified Marketplace guarantees.

The queue now has 110 of its 130 distinct IDs in production and 20 still deferred.
The NVIDIA cuEquivariance original source was also examined at the aggregation's
referenced commit `37e2dfea9bdca4b84bfedeb2da7433bf5a484a6e`; its package directory
contains a `VERSION` symlink, which the current portable package contract rejects.
It is not silently resolved or removed to make the package pass.

The seven entries admitted under per-Skill license priority form one combined
release, with no fixed-size batch cap. Their source bytes and actual authors are
preserved; no evaluation is fabricated. Root notices remain supplemental evidence,
while independently licensed third-party materials keep their own requirements.
This review changes catalog membership and evidence selection only, without
changing schemas, App states or dependency installation behavior.
