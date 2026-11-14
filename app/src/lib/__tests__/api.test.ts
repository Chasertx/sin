type ApiModule = typeof import('../api');

const fetchMock = jest.fn();
(globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;

function respond(status: number, body?: unknown, jsonFails = false) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: jsonFails ? () => Promise.reject(new Error('not json')) : () => Promise.resolve(body),
  });
}

/** Loads a fresh copy of the api module with a given env var / dev-server host. */
function loadApi(envUrl?: string, hostUri?: string | null): ApiModule {
  let mod!: ApiModule;
  jest.isolateModules(() => {
    if (envUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = envUrl;
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: hostUri === null ? {} : { hostUri: hostUri ?? '192.168.1.50:8081' } },
    }));
    mod = require('../api');
  });
  return mod;
}

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: url as string, init: init as RequestInit & { headers: Record<string, string> } };
};

afterEach(() => {
  fetchMock.mockReset();
  delete process.env.EXPO_PUBLIC_API_URL;
});

describe('API_URL resolution', () => {
  it('uses a real configured URL as-is (minus trailing slash)', () => {
    expect(loadApi('https://api.getwhatyaget.app/').API_URL).toBe('https://api.getwhatyaget.app');
  });

  it('swaps a localhost URL for the dev machine IP so phones can reach it', () => {
    expect(loadApi('http://localhost:5080').API_URL).toBe('http://192.168.1.50:5080');
    expect(loadApi('http://127.0.0.1:5080').API_URL).toBe('http://192.168.1.50:5080');
  });

  it('falls back to the dev host when nothing is configured', () => {
    expect(loadApi(undefined).API_URL).toBe('http://192.168.1.50:5080');
  });

  it('falls back to localhost with no config and no dev host', () => {
    expect(loadApi(undefined, null).API_URL).toBe('http://localhost:5080');
  });
});

describe('requests', () => {
  let m: ApiModule;
  beforeEach(() => {
    m = loadApi('https://api.test');
    m.setAuthToken(null);
  });

  it('sends JSON with no auth header when signed out', async () => {
    fetchMock.mockReturnValueOnce(respond(200, { token: 't', userId: 'u', displayName: 'D', needsOnboarding: false }));
    const res = await m.api.login('a@b.c', 'pw');

    const { url, init } = lastCall();
    expect(url).toBe('https://api.test/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.c', password: 'pw' });
    expect(res.token).toBe('t');
  });

  it('adds the bearer token once signed in', async () => {
    m.setAuthToken('jwt-123');
    fetchMock.mockReturnValueOnce(respond(200, []));
    await m.api.feed();
    expect(lastCall().init.headers.Authorization).toBe('Bearer jwt-123');
    expect(lastCall().init.body).toBeUndefined();
  });

  it('surfaces the server error message', async () => {
    fetchMock.mockReturnValueOnce(respond(400, { error: 'That sounds like a compliment.' }));
    await expect(m.api.addFlaw('Habits', 'perfectionist')).rejects.toMatchObject({
      message: 'That sounds like a compliment.',
      status: 400,
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockReturnValueOnce(respond(502, undefined, true));
    await expect(m.api.matches()).rejects.toMatchObject({ message: 'Something went wrong (502).', status: 502 });
  });

  it('reports network failures as status 0 with the server address', async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(new TypeError('Network request failed')));
    const err = await m.api.feed().catch((e) => e);
    expect(err).toBeInstanceOf(m.ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toContain('https://api.test');
  });

  it('calls the unauthorized handler on 401 only when signed in', async () => {
    const handler = jest.fn();
    m.setUnauthorizedHandler(handler);

    fetchMock.mockReturnValueOnce(respond(401, { error: 'Wrong email or password.' }));
    await expect(m.api.login('a', 'b')).rejects.toThrow('Wrong email or password.');
    expect(handler).not.toHaveBeenCalled();

    m.setAuthToken('expired');
    fetchMock.mockReturnValueOnce(respond(401));
    await expect(m.api.me()).rejects.toBeInstanceOf(m.ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockReturnValueOnce(respond(204));
    await expect(m.api.deleteFlaw('f1')).resolves.toBeUndefined();
    expect(lastCall().url).toBe('https://api.test/api/me/flaws/f1');
    expect(lastCall().init.method).toBe('DELETE');
  });

  it('uploads photos as multipart without forcing a content type', async () => {
    fetchMock.mockReturnValueOnce(respond(200, { photoUrl: 'https://x/p.jpg' }));
    const res = await m.api.uploadPhoto('file:///p.jpg', 'image/jpeg', 'p.jpg');
    const { init } = lastCall();
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined(); // fetch sets the multipart boundary itself
    expect(res.photoUrl).toBe('https://x/p.jpg');
  });

  it.each([
    ['swipe', () => m.api.swipe('u2', true), 'POST', '/api/swipes', { targetUserId: 'u2', canLiveWithIt: true }],
    ['send', () => m.api.send('m1', 'hi'), 'POST', '/api/matches/m1/messages', { text: 'hi' }],
    ['messages', () => m.api.messages('m1', 42), 'GET', '/api/matches/m1/messages?after=42', undefined],
    ['unmatch', () => m.api.unmatch('m1'), 'DELETE', '/api/matches/m1', undefined],
    ['block', () => m.api.block('u9'), 'POST', '/api/users/u9/block', undefined],
    ['report', () => m.api.report('u9', 'Spam', 'crypto pitch'), 'POST', '/api/users/u9/report', { reason: 'Spam', details: 'crypto pitch' }],
    ['deleteAccount', () => m.api.deleteAccount(), 'DELETE', '/api/me', undefined],
    ['updateMe', () => m.api.updateMe({ displayName: 'A', age: 30, gender: 'Woman', interestedIn: 'Men', headline: null }), 'PUT', '/api/me', { displayName: 'A', age: 30, gender: 'Woman', interestedIn: 'Men', headline: null }],
    ['register', () => m.api.register({ email: 'e', password: 'p', displayName: 'n', age: 20, gender: 'Man', interestedIn: 'Everyone' }), 'POST', '/api/auth/register', { email: 'e', password: 'p', displayName: 'n', age: 20, gender: 'Man', interestedIn: 'Everyone' }],
  ])('%s hits the right endpoint', async (_name, call, method, path, body) => {
    fetchMock.mockReturnValueOnce(respond(200, {}));
    await call();
    expect(lastCall().init.method).toBe(method);
    expect(lastCall().url).toBe(`https://api.test${path}`);
    if (body === undefined) expect(lastCall().init.body).toBeUndefined();
    else expect(JSON.parse(lastCall().init.body as string)).toEqual(body);
  });

  it('builds an SSO start URL with an encoded return address', () => {
    expect(m.api.ssoStartUrl('Google', 'exp://192.168.1.5:8081/--/auth')).toBe(
      'https://api.test/api/auth/sso/Google?returnUrl=exp%3A%2F%2F192.168.1.5%3A8081%2F--%2Fauth',
    );
  });
});
