import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

import MyProblems from '@/app/(app)/(tabs)/me';
import { api, ApiError } from '@/lib/api';
import type { Profile } from '@/lib/types';

const mockSession = { signOut: jest.fn(), needsOnboarding: false, finishOnboarding: jest.fn() };
jest.mock('@/lib/session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { me: jest.fn(), addFlaw: jest.fn(), deleteFlaw: jest.fn(), updateMe: jest.fn(), uploadPhoto: jest.fn(), deleteAccount: jest.fn() },
}));
const mockedApi = api as jest.Mocked<typeof api>;

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'me',
  displayName: 'Dana',
  age: 29,
  gender: 'Woman',
  interestedIn: 'Everyone',
  headline: 'I read your texts aloud.',
  photoUrl: null,
  flaws: [{ id: 'f1', category: 'Money', text: 'Seven streaming subscriptions.' }],
  ...overrides,
});

const composer = () => screen.getByPlaceholderText("e.g. I eat cereal for dinner and I'm not sorry.");
const fieldAfterLabel = (label: string) => screen.getByLabelText(label);

beforeEach(() => {
  mockedApi.me.mockResolvedValue(profile());
  mockSession.needsOnboarding = false;
});

it('loads and shows the profile', async () => {
  await render(<MyProblems />);
  expect(await screen.findByText('Dana, 29')).toBeTruthy();
  expect(screen.getByText('Seven streaming subscriptions.')).toBeTruthy();
  expect(screen.getByText('1 of 12 confessed')).toBeTruthy();
  expect(fieldAfterLabel('Headline').props.value).toBe('I read your texts aloud.');
});

it('confesses in the chosen category', async () => {
  mockedApi.addFlaw.mockResolvedValue({ id: 'f2', category: 'Temper', text: 'I rage-quit board games.' });
  await render(<MyProblems />);
  await screen.findByText('Dana, 29');

  await fireEvent.press(screen.getByText('🌋 Temper'));
  await fireEvent.changeText(composer(), '  I rage-quit board games.  ');
  await fireEvent.press(screen.getByText('Confess'));

  expect(await screen.findByText('I rage-quit board games.')).toBeTruthy();
  expect(mockedApi.addFlaw).toHaveBeenCalledWith('Temper', 'I rage-quit board games.');
  expect(composer().props.value).toBe('');
  expect(screen.getByText('2 of 12 confessed')).toBeTruthy();
});

it('does nothing when the composer is empty', async () => {
  await render(<MyProblems />);
  await screen.findByText('Dana, 29');
  await fireEvent.press(screen.getByText('Confess'));
  expect(mockedApi.addFlaw).not.toHaveBeenCalled();
});

it('explains a rejected humblebrag and keeps the draft', async () => {
  mockedApi.addFlaw.mockRejectedValue(new ApiError('"perfectionist" sounds suspiciously like a compliment.', 400));
  await render(<MyProblems />);
  await screen.findByText('Dana, 29');
  await fireEvent.changeText(composer(), "I'm a perfectionist");
  await fireEvent.press(screen.getByText('Confess'));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Hmm', expect.stringContaining('compliment')));
  expect(composer().props.value).toBe("I'm a perfectionist");
});

it('deletes a confession only after confirming', async () => {
  mockedApi.deleteFlaw.mockResolvedValue(undefined);
  await render(<MyProblems />);
  await screen.findByText('Seven streaming subscriptions.');

  await fireEvent.press(screen.getByLabelText('Delete confession: Seven streaming subscriptions.'));
  expect(mockedApi.deleteFlaw).not.toHaveBeenCalled();

  const [title, text, buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
  expect([title, text]).toEqual(['Take it back?', 'Seven streaming subscriptions.']);
  await act(async () => {
    await buttons.find((b: { text: string }) => b.text === 'Delete').onPress();
  });

  expect(mockedApi.deleteFlaw).toHaveBeenCalledWith('f1');
  await waitFor(() => expect(screen.queryByText('Seven streaming subscriptions.')).toBeNull());
});

it('saves the basics', async () => {
  mockedApi.updateMe.mockResolvedValue(profile({ displayName: 'Danielle', age: 30, interestedIn: 'Men' }));
  await render(<MyProblems />);
  await screen.findByText('Dana, 29');

  await fireEvent.changeText(fieldAfterLabel('Name'), ' Danielle ');
  await fireEvent.changeText(fieldAfterLabel('Age'), '30');
  await fireEvent.changeText(fieldAfterLabel('Headline'), '   ');
  await fireEvent.press(screen.getByText('Men'));
  await fireEvent.press(screen.getByText('Save'));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Saved ✨', 'Your problems are up to date.'));
  expect(mockedApi.updateMe).toHaveBeenCalledWith({
    displayName: 'Danielle',
    age: 30,
    gender: 'Woman',
    interestedIn: 'Men',
    headline: null,
  });
  expect(mockSession.finishOnboarding).toHaveBeenCalled();
  expect(await screen.findByText('Danielle, 30')).toBeTruthy();
});

it('requires a numeric age before saving', async () => {
  await render(<MyProblems />);
  await screen.findByText('Dana, 29');
  await fireEvent.changeText(fieldAfterLabel('Age'), '');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Hmm', 'Pop your age in as a number.'));
  expect(mockedApi.updateMe).not.toHaveBeenCalled();
});

it('guides new SSO users through onboarding', async () => {
  mockedApi.me.mockResolvedValue(profile({ age: 0, flaws: [] }));
  await render(<MyProblems />);
  expect(await screen.findByText('👋 Almost there')).toBeTruthy();
  expect(fieldAfterLabel('Age').props.value).toBe(''); // no "0"
  expect(screen.getByText('Dana')).toBeTruthy();
});

it('warns when you are invisible because you have no confessions', async () => {
  mockedApi.me.mockResolvedValue(profile({ flaws: [] }));
  await render(<MyProblems />);
  expect(await screen.findByText("🙈 You're invisible right now")).toBeTruthy();
});

it('uploads a picked photo', async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///me.jpg', mimeType: 'image/jpeg', fileName: 'me.jpg' }],
  });
  mockedApi.uploadPhoto.mockResolvedValue({ photoUrl: 'https://photos/me.jpg' });
  await render(<MyProblems />);
  await screen.findByText('Dana, 29');

  await fireEvent.press(screen.getByLabelText('Change photo'));

  await waitFor(() => expect(mockedApi.uploadPhoto).toHaveBeenCalledWith('file:///me.jpg', 'image/jpeg', 'me.jpg'));
  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], allowsEditing: true }));
  expect(await screen.findByTestId('expo-image')).toBeTruthy();
});

it('does nothing if photo picking is cancelled', async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  await render(<MyProblems />);
  await screen.findByText('Dana, 29');
  await fireEvent.press(screen.getByLabelText('Change photo'));
  await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
  expect(mockedApi.uploadPhoto).not.toHaveBeenCalled();
});

it('logs out', async () => {
  await render(<MyProblems />);
  await fireEvent.press(screen.getByLabelText('Log out'));
  expect(mockSession.signOut).toHaveBeenCalled();
});

describe('account', () => {
  const confirmDelete = async () => {
    await fireEvent.press(screen.getByLabelText('Delete account'));
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(title).toBe('Delete your account?');
    expect(message).toMatch(/can't be undone/);
    await act(async () => {
      await buttons.find((b: { text: string }) => b.text === 'Delete forever').onPress();
    });
  };

  beforeEach(() => {
    mockSession.signOut.mockClear();
    mockedApi.deleteAccount.mockReset();
  });

  it('deletes the account after confirmation and signs out', async () => {
    mockedApi.deleteAccount.mockResolvedValue(undefined);
    await render(<MyProblems />);
    await screen.findByText('Dana, 29');
    await confirmDelete();
    expect(mockedApi.deleteAccount).toHaveBeenCalled();
    expect(mockSession.signOut).toHaveBeenCalled();
  });

  it('does not delete without confirmation', async () => {
    await render(<MyProblems />);
    await screen.findByText('Dana, 29');
    await fireEvent.press(screen.getByLabelText('Delete account'));
    expect(mockedApi.deleteAccount).not.toHaveBeenCalled();
  });

  it('stays signed in if deleting fails', async () => {
    mockedApi.deleteAccount.mockRejectedValue(new ApiError('Something went wrong (500).', 500));
    await render(<MyProblems />);
    await screen.findByText('Dana, 29');
    await confirmDelete();
    expect(mockSession.signOut).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('Hmm', 'Something went wrong (500).');
  });

  it('links to the privacy policy and terms', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<MyProblems />);
    await screen.findByText('Dana, 29');
    await fireEvent.press(screen.getByText('Privacy policy'));
    await fireEvent.press(screen.getByText('Terms & community rules'));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/privacy\.html$/));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/terms\.html$/));
  });
});
