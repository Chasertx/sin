import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import Discover from '@/app/(app)/(tabs)/index';
import { api, ApiError } from '@/lib/api';
import type { Profile } from '@/lib/types';

const mockSession = { session: { token: 't', userId: 'me', displayName: 'Dana' } };
jest.mock('@/lib/session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/api', () => ({ ...jest.requireActual('@/lib/api'), api: { feed: jest.fn(), swipe: jest.fn(), block: jest.fn(), report: jest.fn() } }));
const mockedApi = api as jest.Mocked<typeof api>;

const person = (id: string, name: string): Profile => ({
  id,
  displayName: name,
  age: 30,
  gender: 'Woman',
  interestedIn: 'Everyone',
  headline: `${name}'s worst trait`,
  photoUrl: null,
  flaws: [{ id: `${id}-f`, category: 'Temper', text: `${name} argues with phone menus` }],
});

beforeEach(() => {
  mockedApi.swipe.mockResolvedValue({ isMatch: false, matchId: null });
});

it('shows the first person in the feed with a peek of the next', async () => {
  mockedApi.feed.mockResolvedValue([person('a', 'Jess'), person('b', 'Leo')]);
  await render(<Discover />);
  expect(await screen.findByText('Jess argues with phone menus')).toBeTruthy();
  expect(screen.getByText('Leo')).toBeTruthy(); // peek card
  expect(screen.getByText('Ick')).toBeTruthy();
});

it.each([
  ['I can handle that', true],
  ['Too much', false],
])('"%s" records the swipe and moves on', async (button, canHandleIt) => {
  mockedApi.feed.mockResolvedValue([person('a', 'Jess'), person('b', 'Leo'), person('c', 'Sam'), person('d', 'Tom')]);
  await render(<Discover />);
  await screen.findByText('Jess argues with phone menus');

  await fireEvent.press(screen.getByLabelText(button));

  await waitFor(() => expect(mockedApi.swipe).toHaveBeenCalledWith('a', canHandleIt));
  expect(await screen.findByText('Leo argues with phone menus')).toBeTruthy();
  expect(screen.queryByText('Jess argues with phone menus')).toBeNull();
});

it('celebrates a match and opens the chat', async () => {
  mockedApi.feed.mockResolvedValue([person('a', 'Jess'), person('b', 'Leo'), person('c', 'Sam'), person('d', 'Tom')]);
  mockedApi.swipe.mockResolvedValue({ isMatch: true, matchId: 'match-1' });
  await render(<Discover />);
  await screen.findByText('Jess argues with phone menus');

  await fireEvent.press(screen.getByLabelText('I can handle that'));

  expect(await screen.findByText("It's a match!")).toBeTruthy();
  expect(screen.getByText(/You and Jess saw each other's problems/)).toBeTruthy();
  expect(Haptics.notificationAsync).toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Say something brave'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'match-1', name: 'Jess', photo: '', userId: 'a' } });
});

it('lets you dismiss the match and keep swiping', async () => {
  mockedApi.feed.mockResolvedValue([person('a', 'Jess'), person('b', 'Leo'), person('c', 'Sam'), person('d', 'Tom')]);
  mockedApi.swipe.mockResolvedValue({ isMatch: true, matchId: 'match-1' });
  await render(<Discover />);
  await screen.findByText('Jess argues with phone menus');
  await fireEvent.press(screen.getByLabelText('I can handle that'));
  await fireEvent.press(await screen.findByText('Keep swiping'));
  await waitFor(() => expect(screen.queryByText("It's a match!")).toBeNull());
  expect(router.push).not.toHaveBeenCalled();
});

it('fetches more people when the deck runs low, skipping ones already queued', async () => {
  mockedApi.feed
    .mockResolvedValueOnce([person('a', 'Jess'), person('b', 'Leo')])
    .mockResolvedValueOnce([person('b', 'Leo'), person('c', 'Sam')]);
  await render(<Discover />);
  await screen.findByText('Jess argues with phone menus');

  await fireEvent.press(screen.getByLabelText('Too much'));
  await waitFor(() => expect(mockedApi.feed).toHaveBeenCalledTimes(2));

  await fireEvent.press(await screen.findByLabelText('Too much')); // Leo
  expect(await screen.findByText('Sam argues with phone menus')).toBeTruthy();
});

it('shows an empty state when everyone has been seen', async () => {
  mockedApi.feed.mockResolvedValue([]);
  await render(<Discover />);
  expect(await screen.findByText("You've seen everyone's problems")).toBeTruthy();
  expect(screen.queryByLabelText('Too much')).toBeNull();

  mockedApi.feed.mockResolvedValue([person('z', 'Zed')]);
  await fireEvent.press(screen.getByText('Look again'));
  expect(await screen.findByText('Zed argues with phone menus')).toBeTruthy();
});

it('explains when the server is unreachable', async () => {
  mockedApi.feed.mockRejectedValue(new ApiError("Can't reach the server at http://x. Is the API running?", 0));
  await render(<Discover />);
  expect(await screen.findByText('Lost the connection')).toBeTruthy();
  expect(screen.getByText(/Can't reach the server/)).toBeTruthy();
});

it('ignores swipe failures and keeps going', async () => {
  mockedApi.feed.mockResolvedValue([person('a', 'Jess'), person('b', 'Leo'), person('c', 'Sam'), person('d', 'Tom')]);
  mockedApi.swipe.mockRejectedValue(new ApiError('Already swiped on this person.', 409));
  await render(<Discover />);
  await screen.findByText('Jess argues with phone menus');
  await fireEvent.press(screen.getByLabelText('I can handle that'));
  expect(await screen.findByText('Leo argues with phone menus')).toBeTruthy();
  expect(screen.queryByText("It's a match!")).toBeNull();
});

it('reporting the person on top removes them from the deck', async () => {
  mockedApi.feed.mockResolvedValue([person('a', 'Jess'), person('b', 'Leo'), person('c', 'Sam'), person('d', 'Tom')]);
  mockedApi.report.mockResolvedValue(undefined);
  await render(<Discover />);
  await screen.findByText('Jess argues with phone menus');

  await fireEvent.press(screen.getByLabelText('Report or block Jess'));
  await fireEvent.press(screen.getByLabelText('Report Jess'));
  await fireEvent.press(screen.getByText('Fake profile'));
  await fireEvent.changeText(screen.getByPlaceholderText('Anything else we should know? (optional)'), '  stock photo  ');
  await fireEvent.press(screen.getByText('Send report'));

  await waitFor(() => expect(mockedApi.report).toHaveBeenCalledWith('a', 'FakeProfile', 'stock photo'));
  expect(await screen.findByText('Leo argues with phone menus')).toBeTruthy();
  expect(screen.queryByText('Jess argues with phone menus')).toBeNull();
  expect(mockedApi.swipe).not.toHaveBeenCalled();
});

it('blocking the person on top removes them from the deck', async () => {
  mockedApi.feed.mockResolvedValue([person('a', 'Jess'), person('b', 'Leo'), person('c', 'Sam'), person('d', 'Tom')]);
  mockedApi.block.mockResolvedValue(undefined);
  await render(<Discover />);
  await screen.findByText('Jess argues with phone menus');

  await fireEvent.press(screen.getByLabelText('Report or block Jess'));
  await fireEvent.press(screen.getByLabelText('Block Jess'));
  const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
  await act(async () => {
    await buttons.find((b: { text: string }) => b.text === 'Block').onPress();
  });

  expect(mockedApi.block).toHaveBeenCalledWith('a');
  expect(await screen.findByText('Leo argues with phone menus')).toBeTruthy();
});

it('has nobody to report when the deck is empty', async () => {
  mockedApi.feed.mockResolvedValue([]);
  await render(<Discover />);
  await screen.findByText("You've seen everyone's problems");
  expect(screen.queryByLabelText(/Report or block/)).toBeNull();
});
