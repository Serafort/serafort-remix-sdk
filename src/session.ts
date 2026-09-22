import { createCookieSessionStorage, type SessionStorage } from '@remix-run/node';
import type { SerafortRemixOptions } from './types.js';

/**
 * Creates standard Remix cookie session storage configured for Serafort auth tokens.
 */
export function createSerafortSessionStorage(options: SerafortRemixOptions = {}): SessionStorage {
  const cookieSecrets = Array.isArray(options.cookieSecret)
    ? options.cookieSecret
    : [options.cookieSecret || process.env.SESSION_SECRET || process.env.SERAFORT_SESSION_SECRET || 'default-serafort-secret-key-change-in-prod'];

  return createCookieSessionStorage({
    cookie: {
      name: options.cookieName || '__serafort_session',
      secrets: cookieSecrets,
      sameSite: 'lax',
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      ...options.cookieOptions,
    },
  });
}
