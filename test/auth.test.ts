import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSerafortRemix } from '../src/auth.js';
import { SerafortClient, type UserContext } from '@serafort/core';

describe('@serafort/remix auth', () => {
  const mockUser: UserContext = {
    userId: 'usr_remix_123',
    tenantId: 'org_acme',
    roles: ['admin'],
    permissions: ['org:*', 'billing:read'],
  };

  let mockClient: SerafortClient;

  beforeEach(() => {
    mockClient = new SerafortClient({ endpoint: 'https://test.serafort.com' });
    vi.spyOn(mockClient.b2b, 'validateToken').mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return mockUser;
      }
      throw new Error('Invalid token');
    });
  });

  it('resolves unauthenticated session when no headers or cookies are present', async () => {
    const remix = createSerafortRemix({ client: mockClient });
    const request = new Request('https://app.example.com/dashboard');

    const session = await remix.getAuthSession(request);
    expect(session.isAuthenticated).toBe(false);
    expect(session.user).toBeNull();
    expect(session.token).toBeNull();
  });

  it('authenticates user via Authorization header', async () => {
    const remix = createSerafortRemix({ client: mockClient });
    const request = new Request('https://app.example.com/dashboard', {
      headers: {
        Authorization: 'Bearer valid-token',
      },
    });

    const session = await remix.getAuthSession(request);
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.userId).toBe('usr_remix_123');
    expect(session.token).toBe('valid-token');
  });

  it('authenticates user via cookie session', async () => {
    const remix = createSerafortRemix({ client: mockClient });

    // Create session and set token
    const initialSession = await remix.sessionStorage.getSession();
    initialSession.set('token', 'valid-token');
    const cookieHeader = await remix.sessionStorage.commitSession(initialSession);

    const request = new Request('https://app.example.com/dashboard', {
      headers: {
        Cookie: cookieHeader,
      },
    });

    const session = await remix.getAuthSession(request);
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.userId).toBe('usr_remix_123');
  });

  it('requireAuth redirects unauthenticated user to loginUrl with returnTo', async () => {
    const remix = createSerafortRemix({ client: mockClient, loginUrl: '/auth/signin' });
    const request = new Request('https://app.example.com/protected/settings');

    try {
      await remix.requireAuth(request);
      expect.fail('Should have thrown redirect');
    } catch (response: any) {
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe(
        '/auth/signin?returnTo=%2Fprotected%2Fsettings'
      );
    }
  });

  it('requireAuth throws JSON 401 when throwJson is true', async () => {
    const remix = createSerafortRemix({ client: mockClient });
    const request = new Request('https://app.example.com/api/data');

    try {
      await remix.requireAuth(request, { throwJson: true });
      expect.fail('Should have thrown JSON response');
    } catch (response: any) {
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    }
  });

  it('requireAuth enforces tenant, roles, and wildcard permissions', async () => {
    const remix = createSerafortRemix({ client: mockClient });
    const request = new Request('https://app.example.com/admin', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    // Valid case: user has org:acme, admin role, and org:* covers org:billing
    const user = await remix.requireAuth(request, {
      tenantId: 'org_acme',
      roles: ['admin'],
      permissions: ['org:billing'],
    });
    expect(user.userId).toBe('usr_remix_123');

    // Mismatched tenant
    await expect(
      remix.requireAuth(request, { tenantId: 'other_tenant' })
    ).rejects.toThrow('Tenant access denied');

    // Missing role
    await expect(
      remix.requireAuth(request, { roles: ['superadmin'] })
    ).rejects.toThrow('User lacks required role');

    // Missing permission
    await expect(
      remix.requireAuth(request, { permissions: ['system:shutdown'] })
    ).rejects.toThrow('User lacks required permission');
  });

  it('authenticatedLoader supplies authenticated context to handler', async () => {
    const remix = createSerafortRemix({ client: mockClient });
    const request = new Request('https://app.example.com/profile', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const loader = remix.authenticatedLoader(async ({ user, token }) => {
      return { profileUserId: user.userId, tokenUsed: token };
    });

    const result = await loader({ request, params: {}, context: {} });
    expect(result).toEqual({
      profileUserId: 'usr_remix_123',
      tokenUsed: 'valid-token',
    });
  });

  it('createSessionResponse and destroySessionResponse set appropriate Set-Cookie headers', async () => {
    const remix = createSerafortRemix({ client: mockClient });

    const createResp = await remix.createSessionResponse('new-token-123', '/home');
    expect(createResp.status).toBe(302);
    expect(createResp.headers.get('Location')).toBe('/home');
    const setCookie = createResp.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('__serafort_session=');

    const destroyResp = await remix.destroySessionResponse(
      new Request('https://app.example.com', { headers: { Cookie: setCookie! } }),
      '/goodbye'
    );
    expect(destroyResp.status).toBe(302);
    expect(destroyResp.headers.get('Location')).toBe('/goodbye');
    expect(destroyResp.headers.get('Set-Cookie')).toContain('__serafort_session=');
  });
});
