import Constants from 'expo-constants';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import type {
  AuthResponse,
  Ethnicity,
  Flaw,
  FlawCategory,
  Gender,
  InterestedIn,
  Match,
  MatchHistoryEntry,
  Message,
  Preferences,
  Profile,
  ReportReason,
  SwipeResult,
} from './types';

/**
 * Where the .NET API lives.
 * - EXPO_PUBLIC_API_URL (app/.env.local) wins if it's a real address (e.g. your Render URL).
 * - In development we reuse the IP your phone already uses to reach the Expo dev server,
 *   so a phone on the same Wi-Fi finds the API on your PC automatically.
 */
function resolveApiUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) return configured;
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost) return `http://${devHost}:5080`;
  return configured ?? 'http://localhost:5080';
}

export const API_URL = resolveApiUrl();
export const PRIVACY_URL = `${API_URL}/privacy.html`;
export const TERMS_URL = `${API_URL}/terms.html`;

export class ApiError extends Error {
  /**
   * @param code set when the app has to react to the error rather than just show it:
   *             'location_required' or 'outside_us'.
   */
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch (e) {
    if (__DEV__) console.warn(`${method} ${path} failed before a response:`, e);
    throw new ApiError(__DEV__ ? `Can't reach the server at ${API_URL}. Is the API running?` : "Can't connect right now. Check your internet and try again.", 0);
  }

  if (res.status === 401 && authToken) onUnauthorized?.();
  if (!res.ok) {
    let message = `Something went wrong (${res.status}).`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
      if (data?.code) code = data.code;
    } catch {
      // not JSON
    }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // auth
  register: (r: {
    email: string;
    password: string;
    displayName: string;
    age: number;
    gender: Gender;
    interestedIn: InterestedIn;
  }) => request<AuthResponse>('POST', '/api/auth/register', r),
  login: (email: string, password: string) => request<AuthResponse>('POST', '/api/auth/login', { email, password }),
  ssoProviders: () => request<string[]>('GET', '/api/auth/providers'),
  ssoStartUrl: (provider: string, returnUrl: string) =>
    `${API_URL}/api/auth/sso/${provider}?returnUrl=${encodeURIComponent(returnUrl)}`,

  // me
  me: () => request<Profile>('GET', '/api/me'),
  updateMe: (p: {
    displayName: string;
    age: number;
    gender: Gender;
    interestedIn: InterestedIn;
    headline: string | null;
    heightInches: number | null;
    ethnicity: Ethnicity | null;
  }) => request<Profile>('PUT', '/api/me', p),
  /** Where this phone is. The server only accepts places inside the United States. */
  setLocation: (latitude: number, longitude: number, countryCode: string | null) =>
    request<void>('PUT', '/api/me/location', { latitude, longitude, countryCode }),
  preferences: () => request<Preferences>('GET', '/api/me/preferences'),
  savePreferences: (p: Preferences) => request<Preferences>('PUT', '/api/me/preferences', p),
  addFlaw: (category: FlawCategory, text: string) => request<Flaw>('POST', '/api/me/flaws', { category, text }),
  deleteFlaw: (id: string) => request<void>('DELETE', `/api/me/flaws/${id}`),
  /**
   * @param uri     the picked image (a file:// path on phones)
   * @param webFile the browser File object, which the picker only provides on web
   */
  uploadPhoto: (uri: string, webFile?: Blob | null) => {
    const form = new FormData();
    // Expo's fetch only accepts real file objects in a form, not React Native's old { uri, name, type } shape.
    form.append('file', Platform.OS === 'web' && webFile ? webFile : (new File(uri) as unknown as Blob));
    return request<{ photoUrl: string }>('POST', '/api/me/photo', form, true);
  },

  // feed
  feed: () => request<Profile[]>('GET', '/api/feed'),
  swipe: (targetUserId: string, canLiveWithIt: boolean) =>
    request<SwipeResult>('POST', '/api/swipes', { targetUserId, canLiveWithIt }),

  // matches & chat
  matches: () => request<Match[]>('GET', '/api/matches'),
  history: () => request<MatchHistoryEntry[]>('GET', '/api/matches/history'),
  messages: (matchId: string, after: number) =>
    request<Message[]>('GET', `/api/matches/${matchId}/messages?after=${after}`),
  send: (matchId: string, text: string) => request<Message>('POST', `/api/matches/${matchId}/messages`, { text }),
  unmatch: (matchId: string) => request<void>('DELETE', `/api/matches/${matchId}`),

  // safety
  block: (userId: string) => request<void>('POST', `/api/users/${userId}/block`),
  report: (userId: string, reason: ReportReason, details: string | null) =>
    request<void>('POST', `/api/users/${userId}/report`, { reason, details }),
  deleteAccount: () => request<void>('DELETE', '/api/me'),
};
