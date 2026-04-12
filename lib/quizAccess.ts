const QUIZ_ACCESS_TTL_SECONDS = 60 * 60 * 4;
const QUIZ_ACCESS_COOKIE = 'quiz_access';
const encoder = new TextEncoder();

function getQuizAccessSecret() {
  const secret = process.env.QUIZ_ACCESS_SECRET ?? process.env.ADMIN_API_TOKEN;
  if (!secret) {
    console.warn('QUIZ_ACCESS_SECRET is not configured');
    return null;
  }
  return secret;
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function getQuizAccessCookieName() {
  return QUIZ_ACCESS_COOKIE;
}

export function getQuizAccessMaxAge() {
  return QUIZ_ACCESS_TTL_SECONDS;
}

export async function createQuizAccessToken() {
  const secret = getQuizAccessSecret();
  if (!secret) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + QUIZ_ACCESS_TTL_SECONDS;
  const payload = `ap-review:${expiresAt}`;
  const signature = await signValue(payload, secret);

  return `${payload}.${signature}`;
}

export async function verifyQuizAccessToken(token: string | undefined) {
  if (!token) return false;

  const secret = getQuizAccessSecret();
  if (!secret) return false;

  const separatorIndex = token.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return false;
  }

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const payloadParts = payload.split(':');

  if (payloadParts.length !== 2) {
    return false;
  }

  const [scope, expiresAtRaw] = payloadParts;
  if (scope !== 'ap-review') return false;

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const normalizedPayload = `${scope}:${expiresAt}`;
  const expected = await signValue(normalizedPayload, secret);
  return signature === expected;
}
