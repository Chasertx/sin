import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import FinishSignUp from '@/app/onboarding';
import { api, ApiError } from '@/lib/api';
import type { Profile } from '@/lib/types';

const mockSession = {
  session: { token: 't', userId: 'u9', displayName: 'Chase' },
  email: 'chase@gmail.com' as string | null,
  finishOnboarding: jest.fn(),
  signOut: jest.fn(async () => {}),
};
jest.mock('@/lib/session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), api: { me: jest.fn(), updateMe: jest.fn() } }));
const mockedApi = api as jest.Mocked<typeof api>;

const newcomer = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'u9',
  displayName: 'Chase',
  age: 0,
  gender: 'NonBinary',
  interestedIn: 'Everyone',
  headline: null,
  photoUrl: null,
  flaws: [],
  ...overrides,
});

const fill = async ({ age = '31', gender = 'Man', into = 'Women' }: { age?: string; gender?: string | null; into?: string | null } = {}) => {
  await fireEvent.changeText(screen.getByLabelText('Age'), age);
  if (gender) await fireEvent.press(screen.getByText(gender));
  if (into) await fireEvent.press(screen.getByText(into));
  await fireEvent.press(screen.getByText("Let's go"));
};

beforeEach(() => {
  mockedApi.me.mockResolvedValue(newcomer());
  mockSession.email = 'chase@gmail.com';
});

it('arrives with the name and email from Google already filled in', async () => {
  await render(<FinishSignUp />);
  expect(screen.getByLabelText('First name').props.value).toBe('Chase');
  expect(screen.getByLabelText('Signed in as chase@gmail.com')).toBeTruthy();
  // What Google can't tell us is left blank, not guessed.
  expect(screen.getByLabelText('Age').props.value).toBe('');
  expect(screen.getByText('Man').parent?.parent?.props.accessibilityState ?? {}).not.toMatchObject({ selected: true });
});

it('leaves the email out when the provider gave none', async () => {
  mockSession.email = null;
  await render(<FinishSignUp />);
  expect(screen.queryByText('Signed in as')).toBeNull();
  expect(screen.getByLabelText('First name').props.value).toBe('Chase');
});

it('saves the rest and lets them in', async () => {
  mockedApi.updateMe.mockResolvedValue(newcomer({ age: 31, gender: 'Man', interestedIn: 'Women' }));
  await render(<FinishSignUp />);
  await fill();

  await waitFor(() => expect(mockSession.finishOnboarding).toHaveBeenCalled());
  expect(mockedApi.updateMe).toHaveBeenCalledWith({
    displayName: 'Chase',
    age: 31,
    gender: 'Man',
    interestedIn: 'Women',
    headline: null,
    heightInches: null,
    ethnicity: null,
  });
});

it('lets them change the name Google gave', async () => {
  mockedApi.updateMe.mockResolvedValue(newcomer({ age: 31 }));
  await render(<FinishSignUp />);
  await fireEvent.changeText(screen.getByLabelText('First name'), '  Chaz ');
  await fill();
  await waitFor(() => expect(mockedApi.updateMe).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Chaz' })));
});

it.each([
  [{ age: '' }, 'Age'],
  [{ age: 'abc' }, 'Age'],
  [{ gender: null }, 'Almost'],
  [{ into: null }, 'Almost'],
])('asks for what is missing before saving (%#)', async (missing, title) => {
  await render(<FinishSignUp />);
  await fill(missing);
  expect(Alert.alert).toHaveBeenLastCalledWith(title, expect.any(String));
  expect(mockedApi.updateMe).not.toHaveBeenCalled();
  expect(mockSession.finishOnboarding).not.toHaveBeenCalled();
});

it('shows why the server refused (under 18) and stays on the page', async () => {
  mockedApi.updateMe.mockRejectedValue(new ApiError('You must be 18 or older.', 400));
  await render(<FinishSignUp />);
  await fill({ age: '16' });
  await waitFor(() => expect(Alert.alert).toHaveBeenLastCalledWith('Hmm', 'You must be 18 or older.'));
  expect(mockSession.finishOnboarding).not.toHaveBeenCalled();
});

it('carries straight on if the account turns out to be set up already', async () => {
  mockedApi.me.mockResolvedValue(newcomer({ age: 29 }));
  await render(<FinishSignUp />);
  await waitFor(() => expect(mockSession.finishOnboarding).toHaveBeenCalled());
});

it('offers a way out to use a different account', async () => {
  await render(<FinishSignUp />);
  await fireEvent.press(screen.getByText('Use a different account'));
  expect(mockSession.signOut).toHaveBeenCalled();
});
