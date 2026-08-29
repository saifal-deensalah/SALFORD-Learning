import {
  api,
  getSessionUser,
  hasSession,
  signIn,
  signOut,
  mediaUrl,
  API_ORIGIN,
} from '../src/services/api';

const response = (data: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () =>
      status < 400 ? { data } : { error: { code: 'UNAUTHORIZED' } },
  } as Response);
const session = (id = 'student', token = 'old') => ({
  accessToken: token,
  refreshToken: `refresh-${token}`,
  user: {
    id,
    name: id,
    email: `${id}@example.test`,
    role: 'student',
    emailVerified: true,
  },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}
const tick = async () => {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve();
  }
};
beforeEach(async () => {
  globalThis.fetch = jest.fn().mockResolvedValue(response(undefined, 204));
  await signOut();
  (fetch as jest.Mock).mockReset();
});
afterEach(() => jest.restoreAllMocks());

test('media URLs only rewrite the configured local API, preserving remote signed links', () => {
  const port = new URL(API_ORIGIN).port;
  expect(mediaUrl(`/v1/media/images/id`)).toBe(`${API_ORIGIN}/v1/media/images/id`);
  expect(mediaUrl(`http://localhost:${port}/v1/media/stream/id/index.m3u8?signature=x`))
    .toBe(`${API_ORIGIN}/v1/media/stream/id/index.m3u8?signature=x`);
  const external = 'https://storage.example.test/v1/media/uploads/id?signature=secret-test';
  expect(mediaUrl(external)).toBe(external);
  expect(mediaUrl(`http://localhost:${Number(port) + 1}/file`)).toBe(`http://localhost:${Number(port) + 1}/file`);
});

test('a refresh finishing after logout cannot restore the previous account', async () => {
  const refresh = deferred<Response>();
  (fetch as jest.Mock).mockImplementation(async (url: string) =>
    url.endsWith('/auth/login')
      ? response(session())
      : url.endsWith('/auth/refresh')
      ? refresh.promise
      : url.endsWith('/auth/logout')
      ? response(null, 204)
      : response(null, 401),
  );
  await signIn('student@example.test', 'password');
  const request = api<never>('/me').catch(e => e);
  await tick();
  await signOut();
  refresh.resolve(response(session('student', 'new')));
  expect((await request).code).toBe('SESSION_CHANGED');
  expect(hasSession()).toBe(false);
});
test('concurrent unauthorized requests share one refresh and retry with the new token', async () => {
  const refresh = deferred<Response>();
  (fetch as jest.Mock).mockImplementation(
    async (url: string, options: { headers: { Authorization?: string } }) => {
      if (url.endsWith('/auth/login')) {
        return response(session());
      }
      if (url.endsWith('/auth/refresh')) {
        return refresh.promise;
      }
      return options.headers.Authorization === 'Bearer new'
        ? response({ name: 'student' })
        : response(null, 401);
    },
  );
  await signIn('student@example.test', 'password');
  const requests = [api('/me'), api('/me/settings')];
  await tick();
  expect(
    (fetch as jest.Mock).mock.calls.filter(c => c[0].endsWith('/auth/refresh')),
  ).toHaveLength(1);
  refresh.resolve(response(session('student', 'new')));
  expect(await Promise.all(requests)).toEqual([
    { name: 'student' },
    { name: 'student' },
  ]);
});
test('an old account response cannot invalidate or refresh a newer login', async () => {
  const old = deferred<Response>();
  let logins = 0;
  (fetch as jest.Mock).mockImplementation(async (url: string) =>
    url.endsWith('/auth/login')
      ? response(session(++logins === 1 ? 'first' : 'second'))
      : old.promise,
  );
  await signIn('first@example.test', 'password');
  const request = api<never>('/me').catch(e => e);
  await signIn('second@example.test', 'password');
  old.resolve(response(null, 401));
  expect((await request).code).toBe('SESSION_CHANGED');
  expect(getSessionUser()?.id).toBe('second');
  expect(
    (fetch as jest.Mock).mock.calls.filter(c => c[0].endsWith('/auth/refresh')),
  ).toHaveLength(0);
});
test('a pending login is invalidated by logout', async () => {
  const login = deferred<Response>();
  (fetch as jest.Mock).mockReturnValue(login.promise);
  const pending = signIn('first@example.test', 'password').catch(e => e);
  await signOut();
  login.resolve(response(session()));
  expect((await pending).code).toBe('SESSION_CHANGED');
  expect(hasSession()).toBe(false);
});
test('a network failure during refresh does not silently erase an account', async () => {
  (fetch as jest.Mock).mockImplementation(async (url: string) => {
    if (url.endsWith('/auth/login')) {
      return response(session());
    }
    if (url.endsWith('/auth/refresh')) {
      throw new Error('offline');
    }
    return response(null, 401);
  });
  await signIn('student@example.test', 'password');
  await expect(api('/me')).rejects.toThrow('Cannot reach');
  expect(hasSession()).toBe(true);
});
