import { redirect, json, type LoaderFunctionArgs, type ActionFunctionArgs, type Session } from '@remix-run/node';
import { SerafortClient, type UserContext, AuthenticationError } from '@serafort/core';
import { createSerafortSessionStorage } from './session.js';
import type { AuthSession, ProtectOptions, SerafortRemixOptions, AuthenticatedContext } from './types.js';

export interface SerafortRemixInstance {
  client: SerafortClient;
  sessionStorage: ReturnType<typeof createSerafortSessionStorage>;
  getAuthSession: (request: Request) => Promise<AuthSession>;
  requireAuth: (request: Request, options?: ProtectOptions) => Promise<UserContext>;
  authenticatedLoader: <T>(
    handler: (args: LoaderFunctionArgs & AuthenticatedContext) => Promise<T> | T,
    options?: ProtectOptions
  ) => (args: LoaderFunctionArgs) => Promise<T>;
  authenticatedAction: <T>(
    handler: (args: ActionFunctionArgs & AuthenticatedContext) => Promise<T> | T,
    options?: ProtectOptions
  ) => (args: ActionFunctionArgs) => Promise<T>;
  createSessionResponse: (token: string, redirectTo: string) => Promise<Response>;
  destroySessionResponse: (request: Request, redirectTo: string) => Promise<Response>;
}

export function createSerafortRemix(options: SerafortRemixOptions = {}): SerafortRemixInstance {
  const client =
    options.client ||
    new SerafortClient({
      endpoint: options.endpoint || process.env.SERAFORT_ENDPOINT || 'https://api.serafort.com',
    });

  const sessionStorage = options.sessionStorage || createSerafortSessionStorage(options);
  const defaultLoginUrl = options.loginUrl || '/login';

  async function getAuthSession(request: Request): Promise<AuthSession> {
    const session = await sessionStorage.getSession(request.headers.get('Cookie'));
    let token: string | null = null;

    // 1. Check Authorization header
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    // 2. Check Session Cookie
    if (!token) {
      token = session.get('token') || session.get('serafort_token') || null;
    }

    if (!token) {
      return { user: null, token: null, isAuthenticated: false, session };
    }

    try {
      const user = await client.b2b.validateToken(token);
      return { user, token, isAuthenticated: true, session };
    } catch {
      return { user: null, token: null, isAuthenticated: false, session };
    }
  }

  async function requireAuth(request: Request, protectOptions: ProtectOptions = {}): Promise<UserContext> {
    const authSession = await getAuthSession(request);

    if (!authSession.isAuthenticated || !authSession.user) {
      if (protectOptions.throwJson) {
        throw json({ error: 'Unauthorized', message: 'Authentication required' }, { status: 401 });
      }
      const loginUrl = protectOptions.redirectTo || defaultLoginUrl;
      const url = new URL(request.url);
      const redirectUrl = `${loginUrl}?returnTo=${encodeURIComponent(url.pathname + url.search)}`;
      throw redirect(redirectUrl);
    }

    const user = authSession.user;

    // Verify Tenant isolation
    if (protectOptions.tenantId && user.tenantId !== protectOptions.tenantId) {
      if (protectOptions.throwJson) {
        throw json({ error: 'Forbidden', message: 'Tenant access denied' }, { status: 403 });
      }
      throw new AuthenticationError('Tenant access denied');
    }

    // Verify Roles
    if (protectOptions.roles && protectOptions.roles.length > 0) {
      const hasRole = protectOptions.roles.some((r) => user.roles.includes(r));
      if (!hasRole) {
        if (protectOptions.throwJson) {
          throw json(
            { error: 'Forbidden', message: `Required role missing: ${protectOptions.roles.join(', ')}` },
            { status: 403 }
          );
        }
        throw new AuthenticationError(`User lacks required role: ${protectOptions.roles.join(', ')}`);
      }
    }

    // Verify Permissions with wildcard support
    if (protectOptions.permissions && protectOptions.permissions.length > 0) {
      for (const perm of protectOptions.permissions) {
        if (!client.b2b.hasPermission(user, perm)) {
          if (protectOptions.throwJson) {
            throw json(
              { error: 'Forbidden', message: `Required permission missing: ${perm}` },
              { status: 403 }
            );
          }
          throw new AuthenticationError(`User lacks required permission: ${perm}`);
        }
      }
    }

    return user;
  }

  function authenticatedLoader<T>(
    handler: (args: LoaderFunctionArgs & AuthenticatedContext) => Promise<T> | T,
    protectOptions: ProtectOptions = {}
  ) {
    return async (args: LoaderFunctionArgs): Promise<T> => {
      const user = await requireAuth(args.request, protectOptions);
      const authSession = await getAuthSession(args.request);
      return handler({
        ...args,
        user,
        token: authSession.token!,
        session: authSession.session!,
      });
    };
  }

  function authenticatedAction<T>(
    handler: (args: ActionFunctionArgs & AuthenticatedContext) => Promise<T> | T,
    protectOptions: ProtectOptions = {}
  ) {
    return async (args: ActionFunctionArgs): Promise<T> => {
      const user = await requireAuth(args.request, protectOptions);
      const authSession = await getAuthSession(args.request);
      return handler({
        ...args,
        user,
        token: authSession.token!,
        session: authSession.session!,
      });
    };
  }

  async function createSessionResponse(token: string, redirectTo: string): Promise<Response> {
    const session = await sessionStorage.getSession();
    session.set('token', token);
    return redirect(redirectTo, {
      headers: {
        'Set-Cookie': await sessionStorage.commitSession(session),
      },
    });
  }

  async function destroySessionResponse(request: Request, redirectTo: string): Promise<Response> {
    const session = await sessionStorage.getSession(request.headers.get('Cookie'));
    return redirect(redirectTo, {
      headers: {
        'Set-Cookie': await sessionStorage.destroySession(session),
      },
    });
  }

  return {
    client,
    sessionStorage,
    getAuthSession,
    requireAuth,
    authenticatedLoader,
    authenticatedAction,
    createSessionResponse,
    destroySessionResponse,
  };
}

// Global default singleton instance
let defaultInstance: SerafortRemixInstance | null = null;

function getDefaultInstance(): SerafortRemixInstance {
  if (!defaultInstance) {
    defaultInstance = createSerafortRemix();
  }
  return defaultInstance;
}

export async function getAuthSession(request: Request, options?: SerafortRemixOptions): Promise<AuthSession> {
  const instance = options ? createSerafortRemix(options) : getDefaultInstance();
  return instance.getAuthSession(request);
}

export async function requireAuth(
  request: Request,
  protectOptions?: ProtectOptions,
  sdkOptions?: SerafortRemixOptions
): Promise<UserContext> {
  const instance = sdkOptions ? createSerafortRemix(sdkOptions) : getDefaultInstance();
  return instance.requireAuth(request, protectOptions);
}
