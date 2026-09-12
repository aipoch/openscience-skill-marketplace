import { createHash } from "node:crypto";
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const jsonBytes = (value) =>
  Buffer.from(JSON.stringify(value, null, 2) + "\n");
export const utf8Compare = (a, b) =>
  Buffer.compare(Buffer.from(a), Buffer.from(b));
export function assertPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 1024 ||
    value !== value.normalize("NFC") ||
    /[\\\x00-\x1f\x7f<>:"|?*]/.test(value)
  )
    throw new Error(`unsafe path: ${value}`);
  for (const part of value.split("/"))
    if (
      !part ||
      Buffer.byteLength(part, "utf8") > 255 ||
      part === "." ||
      part === ".." ||
      /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)
    )
      throw new Error(`unsafe path: ${value}`);
  return value;
}
export function assertHttps(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error(
      "expected HTTPS URL without credentials, query or fragment",
    );
  return url;
}
export function assertSource(source) {
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      source.repository,
    ) ||
    !/^[a-f0-9]{40}$/.test(source.commit)
  )
    throw new Error("source must use a GitHub repository and immutable commit");
  if (source.path !== undefined) assertPath(source.path);
}
