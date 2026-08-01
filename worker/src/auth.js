import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks;
let jwksIssuer;

export const verifyAccess = async (request, env) => {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, reason: "no-token" };

  try {
    if (!jwks || jwksIssuer !== env.ACCESS_ISSUER) {
      jwks = createRemoteJWKSet(
        new URL("/cdn-cgi/access/certs", env.ACCESS_ISSUER),
      );
      jwksIssuer = env.ACCESS_ISSUER;
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.ACCESS_ISSUER,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
    });
    const email = String(payload.email || "").trim().toLowerCase();
    const allowed = String(env.ALLOWED_EMAILS || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!allowed.includes(email)) return { ok: false, reason: "not-allowed" };
    return { ok: true, email };
  } catch {
    return { ok: false, reason: "invalid-token" };
  }
};

