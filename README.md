# @serafort/remix

Enterprise IAM & B2B Authentication adapter for Remix applications.

## Features

- 🍪 **Cookie Session Storage**: Secure, signed HTTP-only cookie session handling with maxAge and domain options.
- 🛡️ **Route Guards & Wildcard RBAC**: Protect loaders and actions with tenant isolation, roles, and granular wildcard permissions (e.g. `org:*`).
- ⚡ **Dual Token Extraction**: Automatically supports both HTTP-only session cookies and `Authorization: Bearer <token>` headers (ideal for mobile/API clients).
- 🧩 **Higher-Order Functions**: `authenticatedLoader` and `authenticatedAction` inject typed `user`, `token`, and `session` into your Remix handlers.
- 🔀 **Smart Redirection**: Redirects unauthenticated users to `/login?returnTo=...` or returns JSON 401/403 for API endpoints.

## Installation

```bash
npm install @serafort/remix @serafort/core
```

## Quick Start

### 1. Initialize Client

```typescript
// app/services/auth.server.ts
import { createSerafortRemix } from '@serafort/remix';

export const serafort = createSerafortRemix({
  endpoint: process.env.SERAFORT_ENDPOINT || 'https://api.serafort.com',
  cookieSecret: process.env.SESSION_SECRET!,
  loginUrl: '/login',
});

export const {
  requireAuth,
  getAuthSession,
  authenticatedLoader,
  authenticatedAction,
  createSessionResponse,
  destroySessionResponse,
} = serafort;
```

### 2. Protect Loaders

```typescript
// app/routes/dashboard.tsx
import { LoaderFunctionArgs } from '@remix-run/node';
import { authenticatedLoader } from '~/services/auth.server';

export const loader = authenticatedLoader(
  async ({ user }) => {
    return { user };
  },
  {
    roles: ['admin'],
    permissions: ['org:*'],
  }
);
```

### 3. Handle Login & Logout

```typescript
// app/routes/login.tsx
import { ActionFunctionArgs } from '@remix-run/node';
import { createSessionResponse } from '~/services/auth.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const token = formData.get('token') as string;

  return createSessionResponse(token, '/dashboard');
};
```
