import { parseSsoRedirect } from '../sso';

describe('parseSsoRedirect', () => {
  it('reads a successful sign-in', () => {
    expect(parseSsoRedirect('sin://auth#token=abc.def.ghi&userId=u-1&name=Chase%20A&onboarding=0')).toEqual({
      kind: 'success',
      auth: { token: 'abc.def.ghi', userId: 'u-1', displayName: 'Chase A', needsOnboarding: false, email: null },
    });
  });

  it('carries the email a new Google or Apple account came with, for filling in sign-up', () => {
    const r = parseSsoRedirect('sin://auth#token=t&userId=u&name=Jess&onboarding=1&email=jess.o%27neil%2Bick%40gmail.com');
    expect(r.kind === 'success' && r.auth).toMatchObject({ displayName: 'Jess', needsOnboarding: true, email: "jess.o'neil+ick@gmail.com" });
  });

  it('flags new accounts that need onboarding', () => {
    const r = parseSsoRedirect('exp://192.168.1.5:8081/--/auth#token=t&userId=u&onboarding=1');
    expect(r.kind === 'success' && r.auth.needsOnboarding).toBe(true);
  });

  it('decodes + as space and percent escapes', () => {
    const r = parseSsoRedirect('sin://auth#token=t&userId=u&name=Mary+Jo%27s');
    expect(r.kind === 'success' && r.auth.displayName).toBe("Mary Jo's");
  });

  it('defaults a missing name to empty', () => {
    const r = parseSsoRedirect('sin://auth#token=t&userId=u');
    expect(r.kind === 'success' && r.auth.displayName).toBe('');
  });

  it('returns the server error', () => {
    expect(parseSsoRedirect("sin://auth/#error=Google%20sign-in%20isn't%20set%20up")).toEqual({
      kind: 'error',
      message: "Google sign-in isn't set up",
    });
  });

  it.each([
    'sin://auth',
    'sin://auth#',
    'sin://auth#token=only',
    'sin://auth#userId=only',
    'sin://auth#token=&userId=u',
  ])('rejects an incomplete redirect: %s', (url) => {
    expect(parseSsoRedirect(url)).toEqual({ kind: 'error', message: "The server didn't send back a session." });
  });

  it('survives malformed escapes', () => {
    const r = parseSsoRedirect('sin://auth#token=t&userId=u&name=%E0%A4%A');
    expect(r.kind).toBe('success');
  });
});
