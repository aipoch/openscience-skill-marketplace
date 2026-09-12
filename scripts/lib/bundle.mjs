import { mkdir } from "node:fs/promises";
import { directoryStore } from "./publish.mjs";
import { loadCatalog } from "./build.mjs";
import { verifyRoot } from "./signing.mjs";

export async function writeBundle(directory, candidate) {
  await mkdir(directory, { recursive: true });
  const store = await directoryStore(directory);
  for (const [name, bytes] of candidate.objects)
    await store.putImmutable(name, bytes);
  await store.writeRoot(candidate.rootBytes);
}
export async function readBundle(directory, { pin } = {}) {
  const store = await directoryStore(directory);
  const state = await store.readRoot();
  if (!state) throw new Error("missing bundle root");
  if (
    pin &&
    !verifyRoot(
      state.rootBytes,
      JSON.parse(state.signatureBytes ?? "null"),
      pin,
    )
  )
    throw new Error("history signature does not match pin");
  return loadCatalog(state.rootBytes, store.read);
}
