# Original-list review follow-up

Review date: 2026-09-13. Scope: deferred members of the original 584-member
manifest at aggregation commit `d92441066ea6259967469be8e0c8c7b6587928ab`.
The 21 directories outside that manifest and external-source admission are out
of scope. Upstream files were not changed or executed.

This follow-up makes 12 existing deferrals more specific. It admits no additional
Skills: 384 remain selected and 200 remain deferred. It is not a completed review
of all 200 deferred members, and it does not create redistribution approvals.

## Individual license declarations

The [original K-Dense repository guidance](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/README.md#license)
explicitly says individual Skills may have different licenses. Its root MIT notice
therefore does not settle the following discrepancies with the aggregation's MIT
frontmatter. These declarations must be resolved as content licensing evidence;
they are not automatically licenses for a referenced API or Python dependency.
No BSD variant, composite expression or redistribution permission is inferred.

| Original Skill                                                                                                                                                                                    | Original declaration             | Disposition                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| [datamol](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/scientific-skills/datamol/SKILL.md)                                                 | Apache-2.0 license               | Deferred pending applicable terms and notices. |
| [lamindb](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/scientific-skills/lamindb/SKILL.md)                                                 | Apache-2.0 license               | Deferred pending applicable terms and notices. |
| [dnanexus-integration](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/scientific-skills/dnanexus-integration/SKILL.md)                       | Unknown                          | Deferred pending applicable terms and notices. |
| [rowan](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/scientific-skills/rowan/SKILL.md)                                                     | Proprietary (API key required)   | Deferred pending applicable terms and notices. |
| [deeptools](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/scientific-skills/deeptools/SKILL.md)                                             | BSD license                      | Deferred pending applicable terms and notices. |
| [matplotlib](https://github.com/K-Dense-AI/scientific-agent-skills/blob/f4b05302fa4e2c440e3853cd094f4ddeb78ffc7f/scientific-skills/matplotlib/SKILL.md)                                           | Matplotlib LICENSE-directory URL | Deferred pending applicable terms and notices. |
| [metabolomics-workbench-database](https://github.com/K-Dense-AI/scientific-agent-skills/blob/c61a6a2ee035720b59f9be6c8cec9db8398d9442/scientific-skills/metabolomics-workbench-database/SKILL.md) | Unknown                          | Deferred pending applicable terms and notices. |

## Source and dataset findings

These findings come from static inspection of the pinned package. No imported
script, example or test was executed, and no live clinical query was made.

- **[pysam](https://github.com/aipoch/medical-research-skills/blob/d92441066ea6259967469be8e0c8c7b6587928ab/scientific-skills/Data%20Analysis/pysam/SKILL.md)**: The original K-Dense Skill declares MIT, but pinned SKILL.md:214 passes a samtools region string as the positional contig argument in samfile.fetch("chr1:1000-2000"); pysam requires the region keyword for this syntax. Correct source guidance and original redistribution notices remain required before selection.
- **[metagenomic-krona-chart](https://github.com/aipoch/medical-research-skills/blob/d92441066ea6259967469be8e0c8c7b6587928ab/scientific-skills/Data%20Analysis/metagenomic-krona-chart/scripts/main.py)**: scripts/main.py:75-77 derives Kraken2 taxonomy depth from whitespace before the whole row rather than the indented name column, losing the parent hierarchy. The same file credits OpenClaw. Verify correct report parsing, example taxonomy data provenance and original redistribution notices before selection.
- **[clinical-trial-finder](https://github.com/aipoch/medical-research-skills/blob/d92441066ea6259967469be8e0c8c7b6587928ab/scientific-skills/Evidence%20Insight/clinical-trial-finder/writers.py)**: Original ClawBio source at 736753c4a4c55e7ca6c56506b78854def1b172c7 confirms Duvet05 authorship and MIT terms with a Manuel Corpas copyright notice. However, pinned writers.py labels merged EUCTR records as ClinicalTrials.gov in reports/JSON and emits their FHIR identifiers and URLs in the ClinicalTrials.gov namespace. Correct source attribution in generated outputs and include the original notice before selection.
- **[km-survival-curve](https://github.com/aipoch/medical-research-skills/blob/d92441066ea6259967469be8e0c8c7b6587928ab/awesome-med-research-skills/Data%20Analysis/km-survival-curve/tests/data/km_sample1.txt)**: Bundled tests/data/km_sample1.txt, km_sample2.txt and km_sample3.txt contain TCGA sample identifiers with follow-up, outcome, risk-score and expression columns. Establish dataset origins, transformations and redistribution evidence; do not assume synthetic examples from sample filenames.
- **[sample-correlation-analysis](https://github.com/aipoch/medical-research-skills/blob/d92441066ea6259967469be8e0c8c7b6587928ab/awesome-med-research-skills/Data%20Analysis/sample-correlation-analysis/tests/data/sample_correlation_2.csv)**: Bundled tests/data/sample_correlation_2.csv contains TCGA sample identifiers alongside drug-response columns, and sample_correlation_3.csv contains GEO sample identifiers. Establish dataset origins, transformations and redistribution evidence; do not assume synthetic examples from sample filenames.

The [original ClawBio Skill](https://github.com/ClawBio/ClawBio/blob/736753c4a4c55e7ca6c56506b78854def1b172c7/skills/clinical-trial-finder/SKILL.md)
and [MIT notice](https://github.com/ClawBio/ClawBio/blob/736753c4a4c55e7ca6c56506b78854def1b172c7/LICENSE)
resolve the previously unidentified author/source relationship. They do not resolve
the output-source bug. The demo input explicitly contains synthetic search terms;
there is no reason to classify that text as patient data.

## Release impact

Only review explanations change. Selection, versions, configured source, approved
reviews, protocol files and existing immutable release content are unchanged.
There is no production upload for this follow-up. Historical compatibility and
migration: none. New enums or states: none. Persistence: repository review text
only; no App database, cache, installation-state or storage-layout changes.
