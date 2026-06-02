export const AUTH_CALLBACK_PATH = '/auth/callback';

export function buildAuthRedirectUrl(origin, nextPath = '', callbackPath = AUTH_CALLBACK_PATH) {
  const url = new URL(callbackPath, origin);
  // Preserve where the user started (e.g. /groomer) so the post-login route
  // sends them back there instead of defaulting to the customer view. Only
  // same-origin absolute paths — reject protocol-relative ("//host") values.
  if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
    url.searchParams.set('next', nextPath);
  }
  return url.toString();
}

export function isAuthCallbackPath(pathname) {
  return pathname === AUTH_CALLBACK_PATH;
}
