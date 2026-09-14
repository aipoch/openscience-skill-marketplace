# Third-party submission review queue

This directory records the 192 non-AIPOCH source records selected in
`open-science-skills-20260911.zip` (SHA-256
`c8ac63eecc2b1fb2e712aba667be51c829faf7db9d5124853500a1f7db2c3146`).
The archive is an intake-selection input, not a publication artifact or source
of authority. Every release config points to an immutable upstream GitHub commit
and path. Skill payloads and archive-added evaluation files are not committed.

| Provider           | Records | Blocked: missing Skill license | Runtime-ID collision | License-policy review |
| ------------------ | ------: | -----------------------------: | -------------------: | --------------------: |
| Google DeepMind    |       7 |                              7 |                    7 |                     0 |
| K-Dense AI         |      56 |                              2 |                   56 |                    27 |
| NVIDIA BioNeMo     |      31 |                              6 |                    0 |                    14 |
| Synthetic Sciences |      78 |                             14 |                   78 |                    63 |
| Yuan1z0825         |      20 |                             17 |                    0 |                     0 |
| **Total**          | **192** |                         **46** |              **141** |               **104** |

There are 130 unique runtime Skill IDs. All release configs use authoring v1.
Provider identity and the provider-qualified candidate key exist only in this
queue index. Intake review records continue using `<skill-id>@<version>`; inspect
same-name alternatives in separate invocations and files. Queue keys do not change
public App runtime IDs or authorize replacing existing sources. The production
register rejects IDs reserved by any historical member or existing registration;
a colliding candidate requires a separate source-selection decision and change.

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
