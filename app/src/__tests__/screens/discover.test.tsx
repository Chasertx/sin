import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router } from 'expo-router';

import Discover from '@/app/(app)/(tabs)/index';
import { api, ApiError } from '@/lib/api';
import { NO_FILTERS, markFiltersChanged } from '@/lib/filters';
import type { Preferences, Profile } from '@/lib/types';

const mockSession = { session: { token: 't', userId: 'me', displayName: 'Dana' } };
jest.mock('@/lib/session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { feed: jest.fn(), swipe: jest.fn(), block: jest.fn(), report: jest.fn(), setLocation: jest.fn(), preferences: jest.fn(), savePreferences: jest.fn() },
}));
const mockedApi = api as jest.Mocked<typeof api>;
const mockedLocation = Location as jest.Mocked<typeof Location>;
type Permission = Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>;
const permission = (granted: boolean, canAskAgain = true) => ({ granted, canAskAgain, status: granted ? 'granted' : 'denied' }) as Permission;
const locationRequired = new ApiError('Share your location to see who\'s nearby.', 403, 'location_required');

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
  mockedApi.setLocation.mockResolvedValue(undefined);
  mockedApi.preferences.mockResolvedValue(NO_FILTERS);
  mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission(true));
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(permission(true));
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

describe('location (Ick is US-only)', () => {
  it('quietly shares a rough location before loading people', async () => {
    mockedApi.feed.mockResolvedValue([person('a', 'Jess')]);
    await render(<Discover />);
    await screen.findByText('Jess argues with phone menus');
    // Rounded to about a mile, with the country the phone resolved.
    expect(mockedApi.setLocation).toHaveBeenCalledWith(40.71, -74.01, 'US');
    expect(mockedLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks for location when the server has none, then lets you in', async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission(false));
    mockedApi.feed.mockRejectedValueOnce(locationRequired).mockResolvedValue([person('a', 'Jess')]);
    await render(<Discover />);

    expect(await screen.findByText('Where are you?')).toBeTruthy();
    expect(mockedApi.setLocation).not.toHaveBeenCalled(); // nothing shared without a yes
    expect(screen.queryByLabelText('Too much')).toBeNull();

    await fireEvent.press(screen.getByText('Share my location'));
    expect(await screen.findByText('Jess argues with phone menus')).toBeTruthy();
    expect(mockedLocation.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(mockedApi.setLocation).toHaveBeenCalledWith(40.71, -74.01, 'US');
  });

  it('keeps asking if you say no', async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission(false));
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(permission(false));
    mockedApi.feed.mockRejectedValue(locationRequired);
    await render(<Discover />);
    await fireEvent.press(await screen.findByText('Share my location'));
    expect(await screen.findByText('Where are you?')).toBeTruthy();
    expect(mockedApi.setLocation).not.toHaveBeenCalled();
  });

  it('sends you to settings when location is switched off for good', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission(false, false));
    mockedApi.feed.mockRejectedValue(locationRequired);
    await render(<Discover />);

    expect(await screen.findByText('Location is switched off')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open settings'));
    expect(openSettings).toHaveBeenCalled();

    // Back from settings with it switched on.
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission(true));
    mockedApi.feed.mockResolvedValue([person('a', 'Jess')]);
    await fireEvent.press(screen.getByText("I've turned it on"));
    expect(await screen.findByText('Jess argues with phone menus')).toBeTruthy();
  });

  it('shuts Discover to a phone outside the United States', async () => {
    mockedApi.setLocation.mockRejectedValue(new ApiError('Ick is only available in the United States right now.', 403, 'outside_us'));
    mockedApi.feed.mockResolvedValue([person('a', 'Jess')]);
    await render(<Discover />);
    expect(await screen.findByText("Ick isn't here yet")).toBeTruthy();
    expect(mockedApi.feed).not.toHaveBeenCalled();
    expect(screen.queryByText('Jess argues with phone menus')).toBeNull();
  });

  it('still shows people when the phone has no fix but the server remembers you', async () => {
    mockedLocation.getLastKnownPositionAsync.mockRejectedValueOnce(new Error('Location services are off'));
    mockedApi.feed.mockResolvedValue([person('a', 'Jess')]);
    await render(<Discover />);
    expect(await screen.findByText('Jess argues with phone menus')).toBeTruthy();
  });

  it('says so when it cannot find you and the server needs a location', async () => {
    mockedLocation.getLastKnownPositionAsync.mockRejectedValueOnce(new Error('Location services are off'));
    mockedApi.feed.mockRejectedValue(locationRequired);
    await render(<Discover />);
    expect(await screen.findByText("We couldn't find you")).toBeTruthy();
  });

  it('shares a location even when the phone cannot name the country', async () => {
    mockedLocation.reverseGeocodeAsync.mockRejectedValueOnce(new Error('grpc failed'));
    mockedApi.feed.mockResolvedValue([person('a', 'Jess')]);
    await render(<Discover />);
    await screen.findByText('Jess argues with phone menus');
    expect(mockedApi.setLocation).toHaveBeenCalledWith(40.71, -74.01, null);
  });
});

describe('filters', () => {
  const narrow: Preferences = { ...NO_FILTERS, minAge: 30, maxAge: 40 };

  it('explains an empty deck caused by filters and lets you widen them on the spot', async () => {
    mockedApi.preferences.mockResolvedValue(narrow);
    mockedApi.feed.mockResolvedValue([]);
    await render(<Discover />);
    expect(await screen.findByText('Nobody fits those filters yet')).toBeTruthy();

    await fireEvent.press(screen.getByText('Change filters'));
    expect(await screen.findByText('Who you want to see')).toBeTruthy();
    expect(screen.getByText('30 – 40')).toBeTruthy();

    mockedApi.savePreferences.mockResolvedValue(NO_FILTERS);
    mockedApi.feed.mockResolvedValue([person('a', 'Jess')]);
    await fireEvent.press(screen.getByLabelText('Reset filters'));
    await fireEvent.press(screen.getByText('Show people'));

    await waitFor(() => expect(mockedApi.savePreferences).toHaveBeenCalledWith(NO_FILTERS));
    expect(await screen.findByText('Jess argues with phone menus')).toBeTruthy();
    expect(screen.queryByText('Who you want to see')).toBeNull();
  });

  it('keeps the sheet open and says why if saving fails', async () => {
    mockedApi.preferences.mockResolvedValue(narrow);
    mockedApi.feed.mockResolvedValue([]);
    mockedApi.savePreferences.mockRejectedValue(new ApiError("Can't connect right now.", 0));
    await render(<Discover />);
    await fireEvent.press(await screen.findByText('Change filters'));
    await fireEvent.press(await screen.findByText('Show people'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Hmm', "Can't connect right now."));
    expect(screen.getByText('Who you want to see')).toBeTruthy();
  });

  it('reloads people after the filters change on the Possibly Icks tab', async () => {
    mockedApi.feed.mockResolvedValue([person('a', 'Jess')]);
    const view = await render(<Discover />);
    await screen.findByText('Jess argues with phone menus');
    expect(mockedApi.feed).toHaveBeenCalledTimes(1);

    // Coming back to the tab with nothing changed loads nothing new...
    await view.rerender(<Discover />);
    expect(mockedApi.feed).toHaveBeenCalledTimes(1);

    // ...but after a change the old deck is thrown away.
    markFiltersChanged();
    mockedApi.feed.mockResolvedValue([person('b', 'Leo')]);
    await view.unmount();
    await render(<Discover />);
    expect(await screen.findByText('Leo argues with phone menus')).toBeTruthy();
  });
});
