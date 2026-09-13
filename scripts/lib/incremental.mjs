import { verifyCatalog } from "./build.mjs";
import { verifyRoot } from "./signing.mjs";

export function publicationDelta(candidate, history, pin) {
  const root = verifyCatalog(candidate);
  if (!history) {
    if (root.previous_revision !== null)
      throw new Error("publication requires signed parent history");
    return new Map(candidate.objects);
  }
  if (!verifyRoot(history.rootBytes, history.signature, pin))
    throw new Error("untrusted publication history");
  const previous = verifyCatalog(history);
  if (previous.revision !== root.previous_revision)
    throw new Error("publication history is not the signed parent");
  for (const [name, bytes] of history.objects) {
    if (name.startsWith("indexes/")) continue;
    if (!candidate.objects.get(name)?.equals(bytes))
      throw new Error(`historical object changed: ${name}`);
  }
  return new Map(
    [...candidate.objects].filter(
      ([name, bytes]) => !history.objects.get(name)?.equals(bytes),
    ),
  );
}
