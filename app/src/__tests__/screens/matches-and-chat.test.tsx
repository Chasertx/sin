import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';

import Chat from '@/app/(app)/chat/[id]';
import Matches from '@/app/(app)/(tabs)/matches';
import { api, ApiError } from '@/lib/api';
import type { Match, Message } from '@/lib/types';

const mockSession = { session: { token: 't', userId: 'me', displayName: 'Dana' } };
jest.mock('@/lib/session', () => ({ useSession: () => mockSession }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { matches: jest.fn(), messages: jest.fn(), send: jest.fn(), unmatch: jest.fn(), block: jest.fn(), report: jest.fn() },
}));
const mockedApi = api as jest.Mocked<typeof api>;

const match = (id: string, name: string, lastMessage: string | null): Match => ({
  matchId: id,
  otherUserId: `${id}-user`,
  otherName: name,
  otherPhotoUrl: null,
  lastMessage,
  matchedAt: '2026-11-13T17:00:00Z',
});

describe('Matches', () => {
  it('lists conversations and highlights brand-new matches', async () => {
    mockedApi.matches.mockResolvedValue([match('m1', 'Jess', null), match('m2', 'Leo', 'so about the podcast')]);
    await render(<Matches />);

    expect(await screen.findByText('so about the podcast')).toBeTruthy();
    expect(screen.getByText('New matches')).toBeTruthy();
    expect(screen.getAllByText('Jess')).toHaveLength(2); // in the "new" strip and the list
    expect(screen.getByText('New match! Ask about their worst problem 👀')).toBeTruthy();
  });

  it('opens the chat for a match', async () => {
    mockedApi.matches.mockResolvedValue([match('m2', 'Leo', 'hey')]);
    await render(<Matches />);
    await fireEvent.press(await screen.findByText('Leo'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'm2', name: 'Leo', photo: '', userId: 'm2-user' } });
  });

  it('shows an empty state', async () => {
    mockedApi.matches.mockResolvedValue([]);
    await render(<Matches />);
    expect(await screen.findByText('No matches yet')).toBeTruthy();
    expect(screen.queryByText('New matches')).toBeNull();
  });

  it('keeps what it has if refreshing fails', async () => {
    mockedApi.matches.mockRejectedValue(new Error('offline'));
    await render(<Matches />);
    expect(await screen.findByText('No matches yet')).toBeTruthy();
  });
});

describe('Chat', () => {
  const msg = (id: number, senderId: string, text: string): Message => ({ id, senderId, text, sentAt: '2026-11-13T17:04:00Z' });

  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'm1', name: 'Jess', userId: 'jess-id' });
    mockedApi.messages.mockResolvedValue([msg(1, 'me', 'which fonts exactly'), msg(2, 'jess-id', 'Comic Sans. Unironically.')]);
  });

  afterEach(() => jest.useRealTimers());

  it('loads the conversation', async () => {
    await render(<Chat />);
    expect(await screen.findByText('Comic Sans. Unironically.')).toBeTruthy();
    expect(screen.getByText('which fonts exactly')).toBeTruthy();
    expect(screen.getByText('Jess')).toBeTruthy();
    expect(mockedApi.messages).toHaveBeenCalledWith('m1', 0);
  });

  it('shows an icebreaker when there are no messages yet', async () => {
    mockedApi.messages.mockResolvedValue([]);
    await render(<Chat />);
    expect(await screen.findByText('You matched with Jess')).toBeTruthy();
  });

  it('sends a trimmed message and shows it', async () => {
    mockedApi.send.mockResolvedValue(msg(3, 'me', 'bold choice'));
    await render(<Chat />);
    await screen.findByText('Comic Sans. Unironically.');

    await fireEvent.changeText(screen.getByPlaceholderText('Say something honest…'), '  bold choice  ');
    await fireEvent.press(screen.getByLabelText('Send message'));

    expect(await screen.findByText('bold choice')).toBeTruthy();
    expect(mockedApi.send).toHaveBeenCalledWith('m1', 'bold choice');
    expect(screen.getByPlaceholderText('Say something honest…').props.value).toBe('');
  });

  it('does not send blank messages', async () => {
    await render(<Chat />);
    await screen.findByText('Comic Sans. Unironically.');
    await fireEvent.changeText(screen.getByPlaceholderText('Say something honest…'), '   ');
    await fireEvent(screen.getByPlaceholderText('Say something honest…'), 'submitEditing');
    expect(mockedApi.send).not.toHaveBeenCalled();
  });

  it('restores the draft and explains when sending fails', async () => {
    mockedApi.send.mockRejectedValue(new ApiError("That crosses the line. Honest is great; abusive isn't allowed here.", 400));
    await render(<Chat />);
    await screen.findByText('Comic Sans. Unironically.');
    await fireEvent.changeText(screen.getByPlaceholderText('Say something honest…'), 'something rude');
    await fireEvent.press(screen.getByLabelText('Send message'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Didn't send", expect.stringContaining('crosses the line')));
    expect(screen.getByPlaceholderText('Say something honest…').props.value).toBe('something rude');
  });

  it('polls for new messages after the last one it has', async () => {
    jest.useFakeTimers();
    await render(<Chat />);
    await act(async () => {
      await Promise.resolve();
    });
    mockedApi.messages.mockResolvedValue([msg(3, 'jess-id', 'you there?')]);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(mockedApi.messages).toHaveBeenLastCalledWith('m1', 2));
    expect(await screen.findByText('you there?')).toBeTruthy();
  });

  it('never shows the same message twice', async () => {
    mockedApi.send.mockResolvedValue(msg(2, 'jess-id', 'Comic Sans. Unironically.'));
    await render(<Chat />);
    await screen.findByText('Comic Sans. Unironically.');
    await fireEvent.changeText(screen.getByPlaceholderText('Say something honest…'), 'dupe');
    await fireEvent.press(screen.getByLabelText('Send message'));
    await waitFor(() => expect(mockedApi.send).toHaveBeenCalled());
    expect(screen.getAllByText('Comic Sans. Unironically.')).toHaveLength(1);
  });

  it('unmatches after confirmation', async () => {
    mockedApi.unmatch.mockResolvedValue(undefined);
    await render(<Chat />);
    await fireEvent.press(screen.getByLabelText('Chat options'));
    await fireEvent.press(screen.getByLabelText('Unmatch'));

    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(title).toBe('Unmatch?');
    await act(async () => {
      await buttons.find((b: { text: string }) => b.text === 'Unmatch').onPress();
    });

    expect(mockedApi.unmatch).toHaveBeenCalledWith('m1');
    expect(router.back).toHaveBeenCalled();
  });

  it('blocks from the chat menu and leaves the conversation', async () => {
    mockedApi.block.mockResolvedValue(undefined);
    await render(<Chat />);
    await fireEvent.press(screen.getByLabelText('Chat options'));
    await fireEvent.press(screen.getByLabelText('Block Jess'));

    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    expect(title).toBe('Block Jess?');
    await act(async () => {
      await buttons.find((b: { text: string }) => b.text === 'Block').onPress();
    });

    expect(mockedApi.block).toHaveBeenCalledWith('jess-id');
    expect(router.back).toHaveBeenCalled();
  });

  it('reports from the chat menu and leaves the conversation', async () => {
    mockedApi.report.mockResolvedValue(undefined);
    await render(<Chat />);
    await fireEvent.press(screen.getByLabelText('Chat options'));
    await fireEvent.press(screen.getByLabelText('Report Jess'));
    await fireEvent.press(screen.getByText('Harassment or threats'));
    await fireEvent.press(screen.getByText('Send report'));

    await waitFor(() => expect(mockedApi.report).toHaveBeenCalledWith('jess-id', 'Harassment', null));
    expect(router.back).toHaveBeenCalled();
  });

  it('goes back', async () => {
    await render(<Chat />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(router.back).toHaveBeenCalled();
  });
});
