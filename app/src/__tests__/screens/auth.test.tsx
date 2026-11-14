import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';

import Register from '@/app/(auth)/register';
import Welcome from '@/app/(auth)/index';
import { api, ApiError } from '@/lib/api';

const mockSession = { signIn: jest.fn(async () => {}) };
jest.mock('@/lib/session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    api: {
      ssoProviders: jest.fn(),
      ssoStartUrl: jest.fn((p: string, r: string) => `https://api.test/api/auth/sso/${p}?returnUrl=${encodeURIComponent(r)}`),
      login: jest.fn(),
      register: jest.fn(),
    },
  };
});
const mockedApi = api as jest.Mocked<typeof api>;
const openAuth = WebBrowser.openAuthSessionAsync as jest.Mock;
const authResponse = { token: 'jwt', userId: 'u1', displayName: 'Dana', needsOnboarding: false };

describe('Welcome / login', () => {
  beforeEach(() => mockedApi.ssoProviders.mockResolvedValue(['Google', 'Apple']));

  it('shows the brand and SSO buttons with Apple first', async () => {
    await render(<Welcome />);
    expect(screen.getByText('What can you handle?')).toBeTruthy();
    await screen.findByText('Continue with Apple');
    expect(screen.getAllByText(/^Continue with/).map((n) => n.props.children)).toEqual(['Continue with Apple', 'Continue with Google']);
    expect(screen.getByText('or with email')).toBeTruthy();
  });

  it.each([
    ['no providers configured', () => mockedApi.ssoProviders.mockResolvedValue([])],
    ['server unreachable', () => mockedApi.ssoProviders.mockRejectedValue(new Error('offline'))],
  ])('hides SSO when %s', async (_label, arrange) => {
    arrange();
    await render(<Welcome />);
    await waitFor(() => expect(mockedApi.ssoProviders).toHaveBeenCalled());
    expect(screen.queryByText(/^Continue with/)).toBeNull();
    expect(screen.queryByText('or with email')).toBeNull();
  });

  it('asks for both fields before calling the server', async () => {
    await render(<Welcome />);
    await fireEvent.press(screen.getByText('Log in'));
    expect(Alert.alert).toHaveBeenCalledWith('Almost', 'Email and password, please.');
    expect(mockedApi.login).not.toHaveBeenCalled();
  });

  it('logs in with a trimmed email and starts a session', async () => {
    mockedApi.login.mockResolvedValue(authResponse);
    await render(<Welcome />);
    await fireEvent.changeText(screen.getByPlaceholderText('Email'), '  dana@demo.sin ');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'password123');
    await fireEvent.press(screen.getByText('Log in'));

    await waitFor(() => expect(mockSession.signIn).toHaveBeenCalledWith(authResponse));
    expect(mockedApi.login).toHaveBeenCalledWith('dana@demo.sin', 'password123');
  });

  it('shows the server message when login fails', async () => {
    mockedApi.login.mockRejectedValue(new ApiError('Wrong email or password.', 401));
    await render(<Welcome />);
    await fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@b.c');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'nope');
    await fireEvent.press(screen.getByText('Log in'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Nope', 'Wrong email or password.'));
    expect(mockSession.signIn).not.toHaveBeenCalled();
  });

  it('fills in the demo account', async () => {
    await render(<Welcome />);
    await fireEvent.press(screen.getByText('✨ Fill in a demo account'));
    expect(screen.getByPlaceholderText('Email').props.value).toBe('dana@demo.sin');
    expect(screen.getByPlaceholderText('Password').props.value).toBe('password123');
  });

  it('links to account creation', async () => {
    await render(<Welcome />);
    await fireEvent.press(screen.getByText('Create an account'));
    expect(router.push).toHaveBeenCalledWith('/register');
  });

  describe('SSO', () => {
    const press = async (provider: string) => {
      await render(<Welcome />);
      await fireEvent.press(await screen.findByText(`Continue with ${provider}`));
    };

    it('opens a private browser session and signs in from the redirect', async () => {
      openAuth.mockResolvedValue({ type: 'success', url: 'exp://127.0.0.1:8081/--/auth#token=abc&userId=u9&name=Chase&onboarding=1' });
      await press('Google');

      await waitFor(() =>
        expect(mockSession.signIn).toHaveBeenCalledWith({ token: 'abc', userId: 'u9', displayName: 'Chase', needsOnboarding: true }),
      );
      expect(openAuth).toHaveBeenCalledWith(
        'https://api.test/api/auth/sso/Google?returnUrl=exp%3A%2F%2F127.0.0.1%3A8081%2F--%2Fauth',
        'exp://127.0.0.1:8081/--/auth',
        { preferEphemeralSession: true },
      );
    });

    it('shows the error the server sends back', async () => {
      openAuth.mockResolvedValue({ type: 'success', url: "sin://auth#error=Google%20sign-in%20isn't%20set%20up" });
      await press('Google');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Google sign-in', "Google sign-in isn't set up"));
      expect(mockSession.signIn).not.toHaveBeenCalled();
    });

    it('does nothing if the user closes the browser', async () => {
      openAuth.mockResolvedValue({ type: 'cancel' });
      await press('Apple');
      await waitFor(() => expect(openAuth).toHaveBeenCalled());
      expect(mockSession.signIn).not.toHaveBeenCalled();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('reports browser failures', async () => {
      openAuth.mockRejectedValue(new Error('no browser'));
      await press('Google');
      await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Google sign-in failed', 'Error: no browser'));
    });
  });
});

describe('Register', () => {
  const fill = async (overrides: Partial<Record<'Email' | 'Password' | 'First name' | 'Age', string>> = {}) => {
    const values = { Email: ' new@user.app ', Password: 'password123', 'First name': ' Chase ', Age: '29', ...overrides };
    for (const [label, value] of Object.entries(values)) {
      await fireEvent.changeText(screen.getByLabelText(label), value);
    }
  };

  it('rejects a non-numeric age without calling the server', async () => {
    await render(<Register />);
    await fill({ Age: 'old' });
    await fireEvent.press(screen.getByText("Let's go"));
    expect(Alert.alert).toHaveBeenCalledWith('Age', 'Pop your age in as a number.');
    expect(mockedApi.register).not.toHaveBeenCalled();
  });

  it('registers with the chosen options and goes to Possibly Icks', async () => {
    mockedApi.register.mockResolvedValue(authResponse);
    await render(<Register />);
    await fill();
    await fireEvent.press(screen.getByText('Man'));
    await fireEvent.press(screen.getByText('Women'));
    await fireEvent.press(screen.getByText("Let's go"));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/me'));
    expect(mockedApi.register).toHaveBeenCalledWith({
      email: 'new@user.app',
      password: 'password123',
      displayName: 'Chase',
      age: 29,
      gender: 'Man',
      interestedIn: 'Women',
    });
    expect(mockSession.signIn).toHaveBeenCalledWith(authResponse);
  });

  it('shows validation errors from the server', async () => {
    mockedApi.register.mockRejectedValue(new ApiError('You must be 18 or older.', 400));
    await render(<Register />);
    await fill({ Age: '16' });
    await fireEvent.press(screen.getByText("Let's go"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Hmm', 'You must be 18 or older.'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('goes back', async () => {
    await render(<Register />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(router.back).toHaveBeenCalled();
  });
});

it('sign-up shows the terms agreement with working links', async () => {
  const { Linking } = require('react-native');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<Register />);
  expect(screen.getByText(/18 or older/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Terms & community rules'));
  await fireEvent.press(screen.getByText('Privacy policy'));
  expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/terms\.html$/));
  expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/privacy\.html$/));
});
