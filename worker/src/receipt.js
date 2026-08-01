const encoder = new TextEncoder();

const base64url = (bytes) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const decodeBase64url = (value) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const key = (secret) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

export const signReceipt = async (payload, secret) => {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    encoder.encode(body),
  );
  return `${body}.${base64url(new Uint8Array(signature))}`;
};

export const verifyReceipt = async (receipt, secret) => {
  const [body, signature] = String(receipt).split(".");
  if (!body || !signature) throw new Error("invalid-receipt");
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    decodeBase64url(signature),
    encoder.encode(body),
  );
  if (!valid) throw new Error("invalid-receipt");
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(body)));
  if (Date.parse(payload.expiresAt) <= Date.now()) throw new Error("expired-receipt");
  return payload;
};

