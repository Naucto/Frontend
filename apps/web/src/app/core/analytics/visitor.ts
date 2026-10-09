import type { CookieJar } from '../storage/cookies';
import { COOKIE_NAMES, readCookie, removeCookie, writeCookie } from '../storage/cookies';
import { randomId } from './random-id';

/** A visitor cookie lives 13 months and is never extended. */
export const VISITOR_MAX_AGE_SECONDS = 395 * 24 * 60 * 60;
/** A session ends after 30 minutes without activity. */
export const SESSION_MAX_AGE_SECONDS = 30 * 60;

export interface AnalyticsIdentity {
  visitorId: string;
  sessionId: string;
}

/** The visitor id, written once when consent is first granted and never refreshed. */
export function ensureVisitorId(jar: CookieJar = document): string {
  const current = readCookie(COOKIE_NAMES.visitor, jar);
  if (current) {
    return current;
  }
  const visitorId = randomId();
  writeCookie(COOKIE_NAMES.visitor, visitorId, VISITOR_MAX_AGE_SECONDS, jar);
  return visitorId;
}

/** The current session, kept alive for another 30 minutes, or a new one. */
export function touchSession(jar: CookieJar = document): string {
  const sessionId = readCookie(COOKIE_NAMES.session, jar) ?? randomId();
  writeCookie(COOKIE_NAMES.session, sessionId, SESSION_MAX_AGE_SECONDS, jar);
  return sessionId;
}

/** The identity on the cookies now, without creating or extending anything. */
export function currentIdentity(jar: CookieJar = document): AnalyticsIdentity | null {
  const visitorId = readCookie(COOKIE_NAMES.visitor, jar);
  const sessionId = readCookie(COOKIE_NAMES.session, jar);
  return visitorId && sessionId ? { visitorId, sessionId } : null;
}

/** A fresh visitor and session, as after a logout, an erasure, or a visitor the server refused. */
export function rotateVisitor(jar: CookieJar = document): AnalyticsIdentity {
  removeCookie(COOKIE_NAMES.visitor, jar);
  removeCookie(COOKIE_NAMES.session, jar);
  return { visitorId: ensureVisitorId(jar), sessionId: touchSession(jar) };
}

/** A fresh session under the same visitor. */
export function rotateSession(jar: CookieJar = document): string {
  removeCookie(COOKIE_NAMES.session, jar);
  return touchSession(jar);
}

/** Forgets the identity, as when consent is refused or lapses. */
export function clearIdentity(jar: CookieJar = document): void {
  removeCookie(COOKIE_NAMES.visitor, jar);
  removeCookie(COOKIE_NAMES.session, jar);
}
