import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Text } from 'react-native';

import { api, setAuthToken } from '../api';
import { SessionProvider, useSession } from '../session';

const fetchMock = jest.fn();
(globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

let ctx: ReturnType<typeof useSession>;
function Probe() {
  ctx = useSession();
  return <Text testID="state">{ctx.isLoading ? 'loading' : ctx.session ? `in:${ctx.session.displayName}` : 'out'}</Text>;
}

const auth = { token: 'jwt-abc', userId: 'user-1', displayName: 'Dana', needsOnboarding: false };

async function mount() {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('state').props.children).not.toBe('loading'));
}

const authHeaderOfNextRequest = async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => [] });
  await api.feed();
  return (fetchMock.mock.calls.at(-1)![1] as { headers: Record<string, string> }).headers.Authorization;
};

beforeEach(() => {
  fetchMock.mockReset();
  setAuthToken(null);
});

it('starts signed out when nothing is stored', async () => {
  await mount();
  expect(screen.getByTestId('state').props.children).toBe('out');
});

it('restores a saved session and authenticates API calls with it', async () => {
  store.set('gwyg.session', JSON.stringify({ token: 'saved-jwt', userId: 'u', displayName: 'Sam' }));
  await mount();
  expect(screen.getByTestId('state').props.children).toBe('in:Sam');
  expect(await authHeaderOfNextRequest()).toBe('Bearer saved-jwt');
});

it('treats a corrupted stored session as signed out', async () => {
  store.set('gwyg.session', '{not json');
  await mount();
  expect(screen.getByTestId('state').props.children).toBe('out');
});

it('signIn persists the session and carries the onboarding flag', async () => {
  await mount();
  await act(() => ctx.signIn({ ...auth, needsOnboarding: true }));

  expect(screen.getByTestId('state').props.children).toBe('in:Dana');
  expect(ctx.needsOnboarding).toBe(true);
  expect(JSON.parse(store.get('gwyg.session')!)).toEqual({ token: 'jwt-abc', userId: 'user-1', displayName: 'Dana' });
  expect(await authHeaderOfNextRequest()).toBe('Bearer jwt-abc');

  await act(async () => ctx.finishOnboarding());
  expect(ctx.needsOnboarding).toBe(false);
});

it('never stores the onboarding flag or anything beyond what it needs', async () => {
  await mount();
  await act(() => ctx.signIn(auth));
  expect(Object.keys(JSON.parse(store.get('gwyg.session')!)).sort()).toEqual(['displayName', 'token', 'userId']);
});

it('signOut forgets everything', async () => {
  await mount();
  await act(() => ctx.signIn(auth));
  await act(() => ctx.signOut());

  expect(screen.getByTestId('state').props.children).toBe('out');
  expect(store.has('gwyg.session')).toBe(false);
  expect(await authHeaderOfNextRequest()).toBeUndefined();
});

it('signs out automatically when the server rejects the token', async () => {
  await mount();
  await act(() => ctx.signIn(auth));

  fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
  await act(async () => {
    await api.me().catch(() => {});
  });

  await waitFor(() => expect(screen.getByTestId('state').props.children).toBe('out'));
  expect(store.has('gwyg.session')).toBe(false);
});

it('useSession outside the provider is a programming error', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(render(<Probe />)).rejects.toThrow('useSession must be used inside <SessionProvider>');
  spy.mockRestore();
});
