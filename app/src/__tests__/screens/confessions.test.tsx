import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import Confessions from '@/app/(app)/confessions';
import { api, ApiError } from '@/lib/api';
import type { Flaw, Profile } from '@/lib/types';

jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { me: jest.fn(), addFlaw: jest.fn(), deleteFlaw: jest.fn() },
}));
const mockedApi = api as jest.Mocked<typeof api>;

const flaw = (n: number): Flaw => ({ id: `f${n}`, category: 'Quirks', text: `Quirk number ${n}.` });
const me = (flaws: Flaw[]): Profile => ({
  id: 'me',
  displayName: 'Dana',
  age: 29,
  gender: 'Woman',
  interestedIn: 'Everyone',
  headline: null,
  photoUrl: null,
  flaws,
});
const stored = [
  { id: 'f1', category: 'Money', text: 'Seven streaming subscriptions.' },
  { id: 'f2', category: 'Habits', text: 'I leave cabinet doors open.' },
] satisfies Flaw[];

const composer = () => screen.getByPlaceholderText("e.g. I eat cereal for dinner and I'm not sorry.");
const openComposer = async () => {
  await render(<Confessions />);
  await screen.findByText('Seven streaming subscriptions.');
  await fireEvent.press(screen.getByLabelText('Add a confession'));
};

beforeEach(() => {
  mockedApi.me.mockResolvedValue(me(stored));
});

it('lists every confession with its category and a count', async () => {
  await render(<Confessions />);
  expect(await screen.findByText('Seven streaming subscriptions.')).toBeTruthy();
  expect(screen.getByText('I leave cabinet doors open.')).toBeTruthy();
  expect(screen.getByText('💸 Money')).toBeTruthy();
  expect(screen.getByText('2 of 12 confessed')).toBeTruthy();
  // The form only appears when asked for.
  expect(screen.queryByText('Confess')).toBeNull();
});

it('the add button opens the form, and cancel puts it away', async () => {
  await openComposer();
  expect(screen.getByText('Confess something 🙊')).toBeTruthy();
  expect(screen.queryByLabelText('Add a confession')).toBeNull();

  await fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByText('Confess something 🙊')).toBeNull();
  expect(screen.getByLabelText('Add a confession')).toBeTruthy();
});

it('confesses in the chosen category, then goes back to the list', async () => {
  mockedApi.addFlaw.mockResolvedValue({ id: 'f3', category: 'Temper', text: 'I rage-quit board games.' });
  await openComposer();

  await fireEvent.press(screen.getByText('🌋 Temper'));
  await fireEvent.changeText(composer(), '  I rage-quit board games.  ');
  await fireEvent.press(screen.getByText('Confess'));

  expect(await screen.findByText('I rage-quit board games.')).toBeTruthy();
  expect(mockedApi.addFlaw).toHaveBeenCalledWith('Temper', 'I rage-quit board games.');
  expect(screen.getByText('3 of 12 confessed')).toBeTruthy();
  expect(screen.queryByText('Confess something 🙊')).toBeNull();

  // Opening the form again starts empty.
  await fireEvent.press(screen.getByLabelText('Add a confession'));
  expect(composer().props.value).toBe('');
});

it('does nothing when the form is empty', async () => {
  await openComposer();
  await fireEvent.press(screen.getByText('Confess'));
  expect(mockedApi.addFlaw).not.toHaveBeenCalled();
});

it('explains a rejected humblebrag and keeps what was typed', async () => {
  mockedApi.addFlaw.mockRejectedValue(new ApiError('"perfectionist" sounds suspiciously like a compliment.', 400));
  await openComposer();
  await fireEvent.changeText(composer(), "I'm a perfectionist");
  await fireEvent.press(screen.getByText('Confess'));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Hmm', expect.stringContaining('compliment')));
  expect(composer().props.value).toBe("I'm a perfectionist");
  expect(screen.getByText('2 of 12 confessed')).toBeTruthy();
});

it('deletes a confession only after confirming', async () => {
  mockedApi.deleteFlaw.mockResolvedValue(undefined);
  await render(<Confessions />);
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
  expect(screen.getByText('1 of 12 confessed')).toBeTruthy();
});

it('invites a first confession when there are none', async () => {
  mockedApi.me.mockResolvedValue(me([]));
  await render(<Confessions />);
  expect(await screen.findByText('Nothing confessed yet')).toBeTruthy();
  await fireEvent.press(screen.getByText('Add your first confession'));
  expect(composer()).toBeTruthy();
});

it('stops offering to add once the limit is reached', async () => {
  mockedApi.me.mockResolvedValue(me(Array.from({ length: 12 }, (_, i) => flaw(i))));
  await render(<Confessions />);
  expect(await screen.findByText('12 of 12 confessed')).toBeTruthy();
  expect(screen.queryByLabelText('Add a confession')).toBeNull();
  expect(screen.getByText("That's the limit of 12. Delete one to add another.")).toBeTruthy();
});

it('goes back to Possibly Icks', async () => {
  await render(<Confessions />);
  await screen.findByText('Seven streaming subscriptions.');
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(router.back).toHaveBeenCalled();
});
