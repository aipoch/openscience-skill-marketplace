import { createPublicKey, sign, verify } from "node:crypto";
import { validateDocument } from "./protocol.mjs";
function base64(value) {
  if (
    typeof value !== "string" ||
    Buffer.from(value, "base64").toString("base64") !== value
  )
    throw new Error("noncanonical base64");
  return Buffer.from(value, "base64");
}
export function signRoot(bytes, { privateKey, expectedPublicKey, keyId }) {
  const publicKey = createPublicKey(privateKey);
  const encoded = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !expectedPublicKey ||
    encoded !== expectedPublicKey
  )
    throw new Error("Ed25519 signing key does not match independent pin");
  return validateDocument("marketplace-signature", {
    schema_version: 1,
    algorithm: "ed25519",
    key_id: keyId,
    public_key: encoded,
    signature: sign(null, bytes, privateKey).toString("base64"),
  });
}
export function verifyRoot(bytes, signature, expectedPublicKey) {
  try {
    validateDocument("marketplace-signature", signature);
    if (!expectedPublicKey || signature.public_key !== expectedPublicKey)
      return false;
    const key = createPublicKey({
      key: base64(expectedPublicKey),
      type: "spki",
      format: "der",
    });
    const signed = base64(signature.signature);
    return (
      key.asymmetricKeyType === "ed25519" &&
      signed.length === 64 &&
      verify(null, bytes, key, signed)
    );
  } catch {
    return false;
  }
}
