import { createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

const AUTH_SECRET = process.env["SKIREVA_AUTH_SECRET"] ?? "skireva-dev-auth-secret";

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlJson(value: unknown) {
  return base64Url(JSON.stringify(value));
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, saltedHash: string) {
  const [salt, hash] = saltedHash.split(":");
  if (!salt || !hash) return false;
  const expected = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return expected === hash;
}

export function signSessionToken(payload: { userId: string; email: string; name: string }) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    sub: payload.userId,
    email: payload.email,
    name: payload.name,
    iat: Math.floor(Date.now() / 1000),
  };
  const encodedHeader = base64UrlJson(header);
  const encodedBody = base64UrlJson(body);
  const signature = createHmac("sha256", AUTH_SECRET)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64url");
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifySessionToken(token: string): { userId: string; email: string; name: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedBody, signature] = parts;
  const expected = createHmac("sha256", AUTH_SECRET)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64url");
  if (expected !== signature) return null;
  try {
    const bodyRaw = Buffer.from(encodedBody, "base64url").toString("utf8");
    const body = JSON.parse(bodyRaw) as { sub?: string; email?: string; name?: string };
    if (!body.sub || !body.email || !body.name) return null;
    return { userId: body.sub, email: body.email, name: body.name };
  } catch {
    return null;
  }
}

