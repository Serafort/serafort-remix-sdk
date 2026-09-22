import type { UserContext, SerafortClient } from '@serafort/core';
import type { CookieOptions, Session, SessionStorage } from '@remix-run/node';

export interface SerafortRemixOptions {
  /** Serafort IAM backend endpoint */
  endpoint?: string;
  /** Name of the session cookie. Default: '__serafort_session' */
  cookieName?: string;
  /** Secret key(s) used to sign and verify session cookies */
  cookieSecret?: string | string[];
  /** Additional cookie serialization options */
  cookieOptions?: CookieOptions;
  /** URL to redirect unauthenticated users to (e.g. '/login'). Default: '/login' */
  loginUrl?: string;
  /** Pre-configured SerafortClient instance */
  client?: SerafortClient;
  /** Custom session storage implementation if not using default cookie session */
  sessionStorage?: SessionStorage;
}

export interface AuthSession {
  user: UserContext | null;
  token: string | null;
  isAuthenticated: boolean;
  session?: Session;
}

export interface ProtectOptions {
  /** Required granular permissions (supports wildcards like 'org:*') */
  permissions?: string[];
  /** Required roles */
  roles?: string[];
  /** Required tenant ID */
  tenantId?: string;
  /** Optional custom redirect URL instead of default loginUrl */
  redirectTo?: string;
  /** If true, returns a 401/403 JSON Response instead of redirecting. Useful for API loaders/actions. */
  throwJson?: boolean;
}

export interface AuthenticatedContext {
  user: UserContext;
  token: string;
  session: Session;
}
