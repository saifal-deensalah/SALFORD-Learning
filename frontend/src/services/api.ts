import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import local from './local-config.json';

// Android emulator reaches the host through 10.0.2.2. Use HTTPS in production.
export const API_ORIGIN =
  `http://${Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1'}:${local.apiPort}`;
export const requestId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });
const installationId = requestId();
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  emailVerificationRequired?: boolean;
  role: 'admin' | 'student';
};
type Session = { accessToken: string; refreshToken: string; user: SessionUser };
let session: Session | null = null;
let generation = 0;
let adminKey = '';
let refreshing: { generation: number; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getSessionUser = () => session?.user || null;
export const useSessionUser = () =>
  useSyncExternalStore(subscribe, getSessionUser, getSessionUser);
export const hasSession = () => !!session;
export const sessionGeneration = () => generation;
export const setAdminKey = (value: string) => {
  adminKey = value.trim();
};
function replaceSession(value: Session | null) {
  generation++;
  session = value;
  if (!value) {
    adminKey = '';
  }
  listeners.forEach(listener => listener());
}
export class ApiError extends Error {
  constructor(message: string, public code = '', public status = 0) {
    super(message);
  }
}
const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_ALREADY_REGISTERED: 'This email is already registered. Please log in.',
  EMAIL_NOT_VERIFIED: 'Please verify your email first.',
  ACTIVE_VERIFIED_USER_REQUIRED: 'A verified, active account is required.',
  UNAUTHORIZED: 'Please log in again.',
  SESSION_REVOKED: 'Please log in again.',
  RATE_LIMITED: 'Too many attempts. Please wait a minute.',
};
const sessionChanged = () =>
  new ApiError(
    'Your session changed. Please try again.',
    'SESSION_CHANGED',
    401,
  );
async function request<T>(
  route: string,
  method: string,
  body: unknown,
  key: string | undefined,
  auth: Session | null,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_ORIGIN}/v1${route}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
        ...(route.startsWith('/admin/') && adminKey
          ? { 'X-Admin-Key': adminKey }
          : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) {
      return undefined as T;
    }
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const code = json?.error?.code || '';
      throw new ApiError(
        messages[code] ||
          json?.error?.message ||
          'Request failed. Please try again.',
        code,
        response.status,
      );
    }
    if (!json || !('data' in json)) {
      throw new ApiError('The server returned an invalid response.');
    }
    return json.data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      'Cannot reach the server. Check the connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }
}
export async function api<T>(
  route: string,
  method = 'GET',
  body?: unknown,
  key?: string,
): Promise<T> {
  const epoch = generation;
  const auth = session;
  try {
    const data = await request<T>(route, method, body, key, auth);
    if (epoch !== generation) {
      throw sessionChanged();
    }
    return data;
  } catch (error) {
    if (epoch !== generation) {
      throw sessionChanged();
    }
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !auth ||
      route.startsWith('/auth/')
    ) {
      throw error;
    }
    // Another request may already have refreshed this token.
    if (session?.accessToken === auth.accessToken) {
      if (!refreshing || refreshing.generation !== epoch) {
        const promise = request<Session>(
          '/auth/refresh',
          'POST',
          { refreshToken: auth.refreshToken, installationId },
          undefined,
          null,
        )
          .then(value => {
            if (epoch !== generation) {
              throw sessionChanged();
            }
            // A token refresh is not a new login.
            session = { ...value, user: auth.user };
          })
          .catch(refreshError => {
            if (
              epoch === generation &&
              refreshError instanceof ApiError &&
              refreshError.status === 401
            ) {
              replaceSession(null);
            }
            throw refreshError;
          })
          .finally(() => {
            if (refreshing?.generation === epoch) {
              refreshing = null;
            }
          });
        refreshing = { generation: epoch, promise };
      }
      await refreshing.promise;
    }
    if (epoch !== generation) {
      throw sessionChanged();
    }
    try {
      const data = await request<T>(route, method, body, key, session);
      if (epoch !== generation) {
        throw sessionChanged();
      }
      return data;
    } catch (retryError) {
      if (
        epoch === generation &&
        retryError instanceof ApiError &&
        retryError.status === 401
      ) {
        replaceSession(null);
      }
      throw retryError;
    }
  }
}
export async function signIn(email: string, password: string) {
  replaceSession(null);
  const epoch = generation;
  const value = await request<Session>(
    '/auth/login',
    'POST',
    { email, password, installationId, rememberMe: false },
    undefined,
    null,
  );
  if (epoch !== generation) {
    throw sessionChanged();
  }
  replaceSession(value);
  return value.user;
}
export async function signOut() {
  const previous = session;
  // Clear immediately so a late refresh cannot resurrect a logged-out account.
  replaceSession(null);
  if (previous) {
    await request('/auth/logout', 'POST', undefined, undefined, previous);
  }
}
// Only rewrite our local development origin, never an external signed media URL.
export function mediaUrl(value: string) {
  if (value.startsWith('/')) {
    return `${API_ORIGIN}${value}`;
  }
  return value.replace(
    new RegExp(`^http://(?:127\\.0\\.0\\.1|localhost):${local.apiPort}(?=/)`),
    API_ORIGIN,
  );
}
