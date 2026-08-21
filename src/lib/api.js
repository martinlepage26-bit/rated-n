export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    throw new ApiError(
      payload?.error?.message || payload?.message || `Request failed (${response.status})`,
      response.status,
      payload?.error?.code || 'request_failed',
      payload?.error?.details
    );
  }
  return payload;
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });

export const api = {
  config: () => request('/config'),
  auth: {
    me: () => request('/auth/me'),
    login: (email, password) => post('/auth/login', { email, password }),
    logout: () => post('/auth/logout', {}),
    register: (email, password) => post('/auth/register', { email, password }),
    verify: (email, code) => post('/auth/verify', { email, code }),
    resend: (email) => post('/auth/resend', { email }),
    forgotPassword: (email) => post('/auth/password/forgot', { email }),
    resetPassword: (token, password) => post('/auth/password/reset', { token, password }),
    googleUrl: (returnTo = '/') => `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`
  },
  profiles: {
    analyze: (experienceText, region) => post('/profiles/analyze', { experience_text: experienceText, region }),
    list: () => request('/profiles'),
    get: (profileId) => request(`/profiles/${encodeURIComponent(profileId)}`),
    roles: (profileId) => request(`/profiles/${encodeURIComponent(profileId)}/roles`)
  },
  dashboard: () => request('/dashboard'),
  roles: {
    get: (roleId) => request(`/roles/${encodeURIComponent(roleId)}`),
    update: (roleId, changes) => patch(`/roles/${encodeURIComponent(roleId)}`, changes),
    generateMaterials: (roleId) => post(`/roles/${encodeURIComponent(roleId)}/materials`, {})
  }
};
