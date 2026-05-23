// Backend runtime decision placeholder.
// The repo currently deploys the web app plus Netlify functions from apps/web.

export const BACKEND_RUNTIME_OPTIONS = Object.freeze([
  'netlify-functions',
  'dedicated-node-api',
  'supabase-edge-functions',
]);

export const BACKEND_RUNTIME_TODOS = Object.freeze([
  'Choose the production runtime and deployment target.',
  'Add a local dev command for backend routes.',
  'Add a health endpoint that does not require Supabase.',
  'Add request ids, structured logs, normalized errors, and rate limiting.',
  'Add auth middleware that verifies Supabase access tokens server-side.',
  'Add route tests before moving privileged logic out of Netlify stubs.',
]);

export function getBackendRuntimeStatus() {
  // TODO(backend): Replace this static status with the real runtime once
  // apps/api is executable instead of only a source home for route logic.
  return {
    current: 'netlify-functions',
    selected: null,
    todos: BACKEND_RUNTIME_TODOS,
  };
}
