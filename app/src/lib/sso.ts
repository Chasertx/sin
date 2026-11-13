import type { AuthResponse } from './types';

export type SsoOutcome = { kind: 'success'; auth: AuthResponse } | { kind: 'error'; message: string };

/**
 * Parses the URL the API redirects back to after Google/Apple sign-in:
 *   sin://auth#token=...&userId=...&name=...&onboarding=0|1   or   sin://auth#error=...
 * Hand-rolled because React Native's URLSearchParams support is incomplete.
 */
export function parseSsoRedirect(url: string): SsoOutcome {
  const hash = url.indexOf('#');
  const params: Record<string, string> = {};
  if (hash >= 0) {
    for (const pair of url.slice(hash + 1).split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = decode(eq < 0 ? pair : pair.slice(0, eq));
      params[key] = eq < 0 ? '' : decode(pair.slice(eq + 1));
    }
  }

  if (params.error) return { kind: 'error', message: params.error };
  if (!params.token || !params.userId) return { kind: 'error', message: "The server didn't send back a session." };
  return {
    kind: 'success',
    auth: {
      token: params.token,
      userId: params.userId,
      displayName: params.name ?? '',
      needsOnboarding: params.onboarding === '1',
    },
  };
}

function decode(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}
