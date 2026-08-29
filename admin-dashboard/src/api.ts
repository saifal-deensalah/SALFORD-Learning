import type { Session } from './types';
import local from '../../frontend/src/services/local-config.json';
let session: Session | null = null;
let adminKey = '';
let generation = 0;
const installationId = crypto.randomUUID();
let refreshing: {generation: number; promise: Promise<void>} | null = null;
export const sessionGeneration = () => generation;
export const hasSession = () => !!session;
function replaceSession(value: Session | null) {
  generation++;
  const expired = session && !value;
  session = value;
  if (!value) adminKey = '';
  if (expired) window.dispatchEvent(new Event('session-expired'));
}
export const errors: Record<string, string> = {
  INVALID_CREDENTIALS: 'البريد أو كلمة المرور غير صحيحة.',
  FORBIDDEN: 'هذه الصفحة مخصصة لحساب الأدمن.',
  ADMIN_GATEWAY_REQUIRED: 'مفتاح الإدارة مطلوب أو غير صحيح.',
  ADMIN_ACCOUNT_PROTECTED: 'لا يمكن تعطيل حساب الأدمن.',
  PAID_PLAN_TERMS_IMMUTABLE:
    'يوجد اشتراك فعال بهذه الخطة. لا يمكن تغيير تغطيتها أو مزاياها حتى ينتهي.',
  PLAN_COVERAGE_REQUIRED: 'أضف الدورة إلى خطة أولًا قبل نشرها كدورة باشتراك.',
  INCOMPLETE_CURRICULUM: 'أضف درسًا مطلوبًا على الأقل بفيديو جاهز.',
  COVER_NOT_READY: 'اختر صورة غلاف جاهزة.',
  RESOURCE_CONFLICT: 'يوجد سجل بنفس المعرّف أو الاسم المختصر.',
  VALIDATION_ERROR: 'راجع الحقول المطلوبة وصيغة البيانات.',
  RATE_LIMITED: 'طلبات كثيرة. انتظر دقيقة ثم حاول مجددًا.',
  SESSION_REVOKED: 'انتهت الجلسة. سجّل الدخول مجددًا.',
};
export class ApiError extends Error {
  constructor(message: string, public code = '', public status = 0) {
    super(message);
  }
}
const messages = errors;
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
    const response = await fetch(`/v1${route}`, {
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
export async function login(email: string, password: string, key: string) {
  replaceSession(null);
  const epoch = generation;
  const result = await request<Session>('/auth/login', 'POST',
    {email, password, installationId, rememberMe: false}, undefined, null);
  if (epoch !== generation) throw sessionChanged();
  adminKey = key.trim();
  replaceSession(result);
  const ownGeneration = generation;
  try {
    if (result.user.role !== 'admin') throw new Error(errors.FORBIDDEN);
    await api('/admin/overview');
    return result.user;
  } catch (e) {
    if (generation === ownGeneration) await logout().catch(() => {});
    throw e;
  }
}
export async function logout() {
  const previous = session;
  replaceSession(null);
  if (previous) await request('/auth/logout', 'POST', undefined, undefined, previous);
}
export function mediaUrl(value: string) {
  const url = new URL(value, window.location.origin);
  return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) &&
    url.port === String(local.apiPort) && url.pathname.startsWith('/v1/media/')
    ? url.pathname + url.search : value;
}
export async function upload(file: File) {
  const epoch = generation;
  const kind = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('video/')
    ? 'video'
    : null;
  if (!kind || !['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type) || file.size <= 0 || file.size > (kind === 'image' ? 5 : 100) * 1024 * 1024)
    throw new Error('الحد الأقصى: صورة 5MB أو فيديو 100MB.');
  const bytes = await file.arrayBuffer();
  const checksumSha256 = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  if (epoch !== generation) throw sessionChanged();
  const grant = await api<{
    assetId: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }>('/admin/assets/upload-sessions', 'POST', {
    kind,
    mimeType: file.type,
    byteSize: file.size,
    checksumSha256,
  });
  const response = await fetch(mediaUrl(grant.uploadUrl), {
    method: 'PUT',
    headers: grant.headers,
    body: bytes,
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error('فشل رفع الملف. حاول مجددًا.');
  if (epoch !== generation) throw sessionChanged();
  await api(`/admin/assets/${grant.assetId}/complete`, 'POST');
}
