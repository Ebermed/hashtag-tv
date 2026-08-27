import { env } from "cloudflare:workers";
import { cookies } from "next/headers";

const COOKIE_NAME = "hashtag_cabina_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

type CabinaEnvironment = {
  CABINA_USERNAME?: string;
  CABINA_PASSWORD?: string;
  CABINA_PASSWORD_HASH?: string;
  CABINA_SECONDARY_USERNAME?: string;
  CABINA_SECONDARY_PASSWORD?: string;
  CABINA_SESSION_SECRET?: string;
};

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function runtimeEnv(): CabinaEnvironment {
  return env as unknown as CabinaEnvironment;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function sessionSignature(payload: string) {
  const secret = runtimeEnv().CABINA_SESSION_SECRET;
  if (!secret) throw new Error("La sesión de cabina no está configurada.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

async function verifyPasswordHash(password: string, storedHash: string) {
  const [algorithm, iterationsText, saltText, expectedText] = storedHash.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || !saltText || !expectedText) return false;

  try {
    const passwordKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(saltText), iterations }, passwordKey, 256));
    return constantTimeEqual(derived, base64UrlToBytes(expectedText));
  } catch {
    return false;
  }
}

export async function verifyCabinaCredentials(username: string, password: string) {
  const { CABINA_USERNAME, CABINA_PASSWORD, CABINA_PASSWORD_HASH, CABINA_SECONDARY_USERNAME, CABINA_SECONDARY_PASSWORD } = runtimeEnv();
  const primaryUsernameMatches = Boolean(CABINA_USERNAME) && constantTimeEqual(encoder.encode(username), encoder.encode(CABINA_USERNAME ?? ""));
  const secondaryUsernameMatches = Boolean(CABINA_SECONDARY_USERNAME) && constantTimeEqual(encoder.encode(username), encoder.encode(CABINA_SECONDARY_USERNAME ?? ""));

  let primaryPasswordMatches = false;
  if (CABINA_PASSWORD) {
    primaryPasswordMatches = constantTimeEqual(encoder.encode(password), encoder.encode(CABINA_PASSWORD));
  } else if (CABINA_PASSWORD_HASH) {
    primaryPasswordMatches = await verifyPasswordHash(password, CABINA_PASSWORD_HASH);
  }

  const secondaryPasswordMatches = Boolean(CABINA_SECONDARY_PASSWORD)
    && constantTimeEqual(encoder.encode(password), encoder.encode(CABINA_SECONDARY_PASSWORD ?? ""));

  return (primaryUsernameMatches && primaryPasswordMatches)
    || (secondaryUsernameMatches && secondaryPasswordMatches);
}

export async function createCabinaSession(username: string) {
  const payload: SessionPayload = {
    username,
    expiresAt: Date.now() + SESSION_LIFETIME_SECONDS * 1000,
  };
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await sessionSignature(encodedPayload));
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${encodedPayload}.${signature}`, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export async function clearCabinaSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function getCabinaSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const [encodedPayload, suppliedSignature] = token.split(".");
    if (!encodedPayload || !suppliedSignature) return null;
    const expectedSignature = await sessionSignature(encodedPayload);
    if (!constantTimeEqual(base64UrlToBytes(suppliedSignature), expectedSignature)) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload))) as SessionPayload;
    const { CABINA_USERNAME, CABINA_SECONDARY_USERNAME } = runtimeEnv();
    const knownUsername = payload.username === CABINA_USERNAME || payload.username === CABINA_SECONDARY_USERNAME;
    if (!payload.username || payload.expiresAt <= Date.now() || !knownUsername) return null;
    return payload;
  } catch {
    return null;
  }
}
