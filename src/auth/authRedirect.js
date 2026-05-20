export const AUTH_CALLBACK_PATH = '/auth/callback';

export function buildAuthRedirectUrl(origin, callbackPath = AUTH_CALLBACK_PATH) {
  return new URL(callbackPath, origin).toString();
}

export function isAuthCallbackPath(pathname) {
  return pathname === AUTH_CALLBACK_PATH;
}
