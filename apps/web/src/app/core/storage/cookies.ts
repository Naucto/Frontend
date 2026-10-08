/**
 * Typed, try/catch-wrapped first-party cookies. Set by the app on its own origin and sent nowhere
 * by the API client, which never reads them: what the backend needs travels in request bodies.
 */
export const COOKIE_NAMES = {
  consent: 'naucto_consent',
  visitor: 'naucto_vid',
  session: 'naucto_sid',
} as const;

export type CookieName = (typeof COOKIE_NAMES)[keyof typeof COOKIE_NAMES];

export type CookieJar = Pick<Document, 'cookie'>;

const secureOrigin = (): boolean =>
  typeof location !== 'undefined' && location.protocol === 'https:';

export function readCookie(name: CookieName, jar: CookieJar = document): string | null {
  try {
    for (const pair of jar.cookie.split(';')) {
      const separator = pair.indexOf('=');
      if (separator > 0 && pair.slice(0, separator).trim() === name) {
        return decodeURIComponent(pair.slice(separator + 1).trim());
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCookie(
  name: CookieName,
  value: string,
  maxAgeSeconds: number,
  jar: CookieJar = document,
  secure: boolean = secureOrigin(),
): void {
  try {
    jar.cookie =
      `${name}=${encodeURIComponent(value)}; Max-Age=${String(Math.round(maxAgeSeconds))}; ` +
      `Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
  } catch {
    /* cookies disabled */
  }
}

export function removeCookie(
  name: CookieName,
  jar: CookieJar = document,
  secure: boolean = secureOrigin(),
): void {
  writeCookie(name, '', 0, jar, secure);
}
