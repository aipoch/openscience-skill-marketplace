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
