import { execFileSync } from "node:child_process";
import { assertPath, assertSource, sha256 } from "./common.mjs";
import { inspectFrontmatter, extractEvaluation } from "./catalog.mjs";

export function gitSnapshot(repository, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("source commit must be immutable");
  const git = (args, options = {}) =>
    execFileSync("git", ["-C", repository, ...args], {
      maxBuffer: 600 * 1024 * 1024,
      ...options,
    });
  const files = git(["ls-tree", "-rlz", commit])
    .toString()
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const tab = row.indexOf("\t");
      const [mode, type, oid, size] = row.slice(0, tab).trim().split(/\s+/);
      return { path: row.slice(tab + 1), mode, type, oid, size: Number(size) };
    });
  const byPath = new Map(files.map((f) => [f.path, f]));
  return {
    files,
    read(paths) {
      const requested = paths.map((p) => {
        const f = byPath.get(p);
        if (!f || f.type !== "blob")
          throw new Error(`missing source blob: ${p}`);
        return f;
      });
      const input = requested.map((f) => f.oid).join("\n") + "\n";
      if (!requested.length) return new Map();
      const output = git(["cat-file", "--batch"], { input });
      let offset = 0;
      const result = new Map();
      for (const file of requested) {
        const end = output.indexOf(10, offset);
        const [oid, type, size] = output
          .subarray(offset, end)
          .toString()
          .split(" ");
        if (oid !== file.oid || type !== "blob" || Number(size) !== file.size)
          throw new Error("source object mismatch");
        const bytes = output.subarray(end + 1, end + 1 + file.size);
        if (bytes.length !== file.size)
          throw new Error("truncated source object");
        result.set(file.path, bytes);
        offset = end + file.size + 2;
      }
      return result;
    },
  };
}

const isEvaluationReport = (name) =>
  /^(?:eval_report_.+|.+_audit_result(?:_v[0-9]+)?)\.json$/.test(name);

export function auditSources(manifest, snapshot, source) {
  assertSource(source);
  const selected = snapshot.files.filter((f) =>
    manifest.entries.some((e) => f.path.startsWith(e.sourcePath + "/")),
  );
  const textPaths = selected
    .filter((f) => f.mode === "100644" || f.mode === "100755")
    .filter(
      (f) =>
        f.size <= 4 * 1024 * 1024 &&
        (/\/SKILL\.md$/.test(f.path) ||
          isEvaluationReport(f.path.split("/").at(-1))),
    )
    .map((f) => f.path);
  const texts = snapshot.read(textPaths);
  const entries = manifest.entries.map((entry) => {
    const files = selected.filter((f) =>
      f.path.startsWith(entry.sourcePath + "/"),
    );
    const issues = [];
    const add = (code, detail) => issues.push({ code, detail });
    const skillBytes = files.reduce((n, f) => n + f.size, 0);
    const seen = new Set();
    for (const file of files) {
      const relative = file.path.slice(entry.sourcePath.length + 1);
      try {
        assertPath(relative);
      } catch (e) {
        add("unsafe-path", e.message);
      }
      const folded = relative.normalize("NFC").toLowerCase();
      if (seen.has(folded)) add("path-collision", relative);
      seen.add(folded);
      if (file.mode !== "100644" && file.mode !== "100755")
        add("special-file", relative);
      if (folded.endsWith("/skill.md")) add("nested-skill", relative);
      if (relative.split("/").length > 8) add("path-depth", relative);
      if ([".source.json", ".specialist-package.json"].includes(folded))
        add("reserved-file", relative);
      if (file.size > 50 * 1024 * 1024)
        add("file-size", `${relative}: ${file.size}`);
    }
    if (files.length > 16384) add("file-count", String(files.length));
    if (skillBytes > 128 * 1024 * 1024) add("skill-size", String(skillBytes));
    const front = inspectFrontmatter(
      texts.get(entry.sourcePath + "/SKILL.md")?.toString() ?? "",
    );
    if (!front.valid)
      add(
        front.syntaxValid ? "invalid-frontmatter" : "invalid-yaml",
        front.errors.join("; "),
      );
    if (front.name !== entry.id) add("identity-mismatch", String(front.name));
    const data = front.data;
    const license = data?.license ?? data?.metadata?.license;
    const author =
      data?.author ??
      data?.metadata?.author ??
      data?.metadata?.["skill-author"];
    if (front.valid && (typeof license !== "string" || !license.trim()))
      add("missing-license", "No per-Skill license declaration");
    const reports = files.filter((f) => {
      const relative = f.path.slice(entry.sourcePath.length + 1);
      return !relative.includes("/") && isEvaluationReport(relative);
    });
    if (reports.length > 1)
      add(
        "ambiguous-evaluation",
        "Multiple reports require explicit source review: " +
          reports.map((f) => f.path).join(", "),
      );
    const reportPath = reports.length === 1 ? reports[0].path : undefined;
    const reportBytes = reportPath ? texts.get(reportPath) : undefined;
    let evaluation;
    if (reportBytes) {
      try {
        evaluation = extractEvaluation(
          JSON.parse(reportBytes),
          { ...source, path: entry.sourcePath },
          entry.id,
          reportPath,
        );
      } catch (e) {
        add("invalid-evaluation", e.message);
      }
    } else if (reportPath)
      add("invalid-evaluation", "Report is not a bounded regular JSON file");
    return {
      ...entry,
      source: { ...source, path: entry.sourcePath },
      fileCount: files.length,
      totalBytes: skillBytes,
      ...(data ? { description: data.description } : {}),
      ...(typeof license === "string" ? { declaredLicense: license } : {}),
      ...(typeof author === "string" && author.trim()
        ? { authors: [{ name: author }] }
        : {}),
      ...(evaluation ? { evaluation } : {}),
      ...(reportPath ? { evaluationReportPath: reportPath } : {}),
      ...(reportBytes ? { evaluationReportSha256: sha256(reportBytes) } : {}),
      issues,
    };
  });
  return {
    schemaVersion: 1,
    source,
    memberCount: entries.length,
    fileCount: entries.reduce((n, e) => n + e.fileCount, 0),
    totalBytes: entries.reduce((n, e) => n + e.totalBytes, 0),
    entries,
  };
}
