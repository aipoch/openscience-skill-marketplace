# Citation network intake review

Review date: 2026-09-13. This admits one previously deferred original-list member,
`citation-network@1.0.0`, retaining all 384 existing selections and leaving 199
deferred. Selection is preparation for publication; check the production workflow
for availability.

## Pinned package and redistribution evidence

The [upstream package](https://github.com/aipoch/medical-research-skills/tree/63c61d38c6c4bba5128f98f0b225aa44e3fe748d/scientific-skills/Evidence%20Insight/citation-network)
contains eight files totaling 32,094 bytes: SKILL.md, a polish changelog, the
original evaluation JSON, two reference notes and three Python scripts. All files
were inspected as text; Python syntax was parsed without importing or executing
any Skill program. No upstream files were changed, removed or supplemented with
invented references.

SKILL.md credits AIPOCH and declares MIT. The package has illustrative citation
pairs and short methodological notes, with no bundled publication text, external
dataset or vendored library. The [root MIT notice](https://github.com/aipoch/medical-research-skills/blob/63c61d38c6c4bba5128f98f0b225aa44e3fe748d/LICENSE)
retains the 2026 AIpoch copyright. Its SHA-256 is
`92cd32f3b4857f97a3ad6bf276c42dea2e93fd2bb714b08d75a558c9f215f596`;
the builder includes these exact bytes under `LICENSES/` as a ninth package file.
The reviewed eight-file content digest is
`4526395a1d7c87f7aa5eae0da841aac2bb7533c7695d18f2c8410e95a6833940`.

## Repaired blocker and remaining limitations

The previously deferred exporter embedded raw JSON containing user-derived node
labels inside an HTML script element. The selected commit's
[exporter](https://github.com/aipoch/medical-research-skills/blob/63c61d38c6c4bba5128f98f0b225aa44e3fe748d/scientific-skills/Evidence%20Insight/citation-network/scripts/export_gexf_html.py)
escapes every `<` in serialized JSON as `\u003c`, preventing a label from closing
that script element. The repaired source is pinned only for this unpublished
member; the default source commit is unchanged.

`references/README.md` is still absent. SKILL.md calls it “Additional documentation”;
neither a workflow step nor a script reads it. Both named methodological reference
files exist. This optional documentation gap is recorded rather than treated as
a missing execution dependency or silently repaired in the ZIP.

The default CSV-to-GEXF/metrics/HTML workflow is present. HTML loads vis-network
from an unversioned unpkg URL and therefore requires network access; the library
is not redistributed in this package. If a caller changes `output_gexf` in the
run configuration, the automatic exporter still uses its default GEXF path;
the separate exporter accepts `--input` for a custom path. Advanced centrality
and community analysis are described as downstream work, not produced metrics.
This static review does not certify runtime behavior or offline operation.

The existing report is preserved as an upstream self-assessment: 90/100, static
96/100, dynamic 86.6/100, evaluated on 2026-06-15 with `skill-auditor@1.0`.
Its date predates the repair. No assessed Skill version or evaluation of the
repair is inferred, and it is not an independent safety endorsement.

## Release impact

The existing incremental path adds this member's descriptor and package shard
and updates catalog discovery and the immutable-object index. Authenticated
history must preserve all 384 earlier listings, descriptors and nine ZIP shards
byte-for-byte. The immutable original manifest and baseline audit are unchanged.

The unsigned build against authenticated production revision
`392572e7f48426b2a8dd518e0f4d4d3ec07124668dcd156e5b3a450e0f3b93e1`
produced 385 listings. All 384 old listings and descriptors and nine old ZIPs were
byte-identical. The only new immutable objects are one descriptor, one 12,606-byte
ZIP and the new release index. The new ZIP retains all eight source files exactly
and adds only the verified MIT notice. No production upload was performed.

Historical compatibility: no migration, aliases or immutable-content replacement.
New enums or states: none. Persistence: existing repository selection/review data
and, after publication, new CDN/GitHub release objects using the existing layout;
no App database, cache schema or installation-state change. No UI changes.
