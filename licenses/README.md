# Supplemental upstream license notices

These files are verbatim notices reviewed against immutable original source
commits. They retain their own licenses, not the Marketplace tooling's Apache-2.0
license. Each filename is the SHA-256 of its raw bytes. Git and formatting tools
must not normalize these files.

## K-Dense paper-lookup notice

- Copy: [09b02a3c9df3053c55531d503357a9c7cde275970e6c3ceaa1ddf5f0e90b40c1.txt](09b02a3c9df3053c55531d503357a9c7cde275970e6c3ceaa1ddf5f0e90b40c1.txt)
- Original: [K-Dense LICENSE.md at f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/LICENSE.md).
- Copyright holder: K-Dense Inc., 2025; license: MIT; size: 1,068 bytes.
- Original Git blob: `eb246475fd5a66b9bb56176f3a718984632dd98d`.

The ten reference files in the pinned `paper-lookup` package match the original
`scientific-skills/paper-lookup/references/` files byte for byte at that commit.
The original SKILL instructions and the aggregator's frontmatter/output-template
edits were compared. The package contains instructions, reference documentation,
a changelog and an upstream assessment; it does not bundle executable scripts,
article full texts or database exports. All referenced local database guides are
present. The recorded review covers this exact package, not other K-Dense Skills.

The static review on 2026-09-13 checked database selection, identifier handling,
API key guidance, request/error recovery and output instructions. OpenAlex's
[August 2026 authentication documentation](https://help.openalex.org/api/authentication/)
allows keyless basic queries, so its older February announcement requiring keys
is not used as a blocker. External APIs, quotas and credentials remain runtime
dependencies; no imported code or authenticated API queries were executed.
The upstream self-assessment is preserved as such, not treated as independent
runtime or safety verification.

The package's content source remains the fixed AIPOCH aggregation repository;
its author remains K-Dense Inc., its Marketplace publisher remains AIPOCH, and
this notice points separately to the original K-Dense repository. Both the
aggregator's root MIT notice and this original notice are retained in the ZIP.

## Pending mixed-license evidence

The following verbatim copies come from Creative Commons' official
`cc-legal-tools-data` repository at commit
`6d7046ff3146bbc034e88d9c87854e43d2a28e32`. Their raw SHA-256 filenames
are bound by the unapproved evidence records in `skills/reviews.json`.

| Material                                   | License copy                                                                                  | Original text                                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `alphafold-db/out/P00520.cif` and `.pdb`   | [CC BY 4.0](9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411.txt)             | [Official pinned text](https://github.com/creativecommons/cc-legal-tools-data/blob/6d7046ff3146bbc034e88d9c87854e43d2a28e32/docs/licenses/by/4.0/legalcode.txt)    |
| `bib-formatter/styles/*.csl` (three files) | [CC BY-SA 3.0 Unported](3f941b3b89cf7b8370ceb83cc76d2120d471b58735d8ca60238a751a48d7f72f.txt) | [Official pinned text](https://github.com/creativecommons/cc-legal-tools-data/blob/6d7046ff3146bbc034e88d9c87854e43d2a28e32/docs/licenses/by-sa/3.0/legalcode.txt) |

The AlphaFold files retain DeepMind Technologies Limited's 2021 copyright
notice, license declaration, citations and disclaimer. The CSL XML retains
each style's title, source URI, authors, contributors and CC BY-SA 3.0 notice.
Preserve those files unchanged; the additional legal texts supplement their
existing notices. They do not replace the Skill's MIT declaration, relicense
third-party components or establish permission for unrelated content.

These records deliberately omit `reviewed_by` and `reviewed_on`. Both Skills
remain deferred until mixed-license projection and package review are complete.
Adding evidence does not select, approve or publish a release.
