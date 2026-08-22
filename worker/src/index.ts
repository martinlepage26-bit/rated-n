import { handleAuth } from './auth';
import { emailConfigured } from './email';
import { ApiProblem, assertSameOrigin, handleError, json } from './http';
import { handleProfiles } from './profiles';
import type { Env } from './types';

export { AnalysisWorkflow } from './workflow';

function apiPath(url: URL): string {
  if (url.pathname === '/api') return '/';
  return url.pathname.startsWith('/api/') ? url.pathname.slice(4) : url.pathname;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = apiPath(url);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET, POST, PATCH, OPTIONS' } });
      assertSameOrigin(request, env);
      if (request.method === 'GET' && (path === '/health' || path === '/')) {
        return json({ ok: true, service: 'rated-n-api' }, 200, { 'Cache-Control': 'public, max-age=30' });
      }
      if (request.method === 'GET' && path === '/config') {
        return json({
          google_auth_enabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
          email_delivery_enabled: emailConfigured(env)
        });
      }
      if (path.startsWith('/auth/')) return await handleAuth(request, url, path, env);
      if (path.startsWith('/profiles') || path.startsWith('/roles') || path === '/dashboard') return await handleProfiles(request, path, env);
      throw new ApiProblem(404, 'not_found', 'That Rated N endpoint does not exist.');
    } catch (caught) {
      return handleError(caught);
    }
  }
} satisfies ExportedHandler<Env>;
