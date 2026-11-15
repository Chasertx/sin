import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';

import type { MatchHistoryEntry } from '@/lib/types';

import { HistoryTimeline } from '../HistoryTimeline';

const at = (month: number, day: number, hour = 12, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString();

const current: MatchHistoryEntry = {
  id: 'm-1',
  otherName: 'Jess',
  otherPhotoUrl: null,
  matchedAt: at(11, 14, 19, 32),
  endedAt: null,
  endedByMe: false,
  matchId: 'match-1',
  otherUserId: 'u-1',
};
const unmatched: MatchHistoryEntry = {
  id: 'p-7',
  otherName: 'Marcus',
  otherPhotoUrl: null,
  matchedAt: at(10, 2, 9, 0),
  endedAt: at(10, 5, 9, 30),
  endedByMe: true,
  matchId: null,
  otherUserId: 'u-2',
};
const left: MatchHistoryEntry = { ...unmatched, id: 'p-8', otherName: null, otherUserId: null, endedByMe: false, matchedAt: at(9, 1), endedAt: at(9, 2) };

const setup = async (props: Partial<ComponentProps<typeof HistoryTimeline>> = {}) => {
  const onOpen = jest.fn();
  const onRefresh = jest.fn();
  await render(<HistoryTimeline entries={[current, unmatched, left]} loaded refreshing={false} onRefresh={onRefresh} onOpen={onOpen} {...props} />);
  return { onOpen, onRefresh };
};

it('lays out every match and unmatch under its month, with dates', async () => {
  await setup();
  expect(screen.getByText('November 2026')).toBeTruthy();
  expect(screen.getByText('October 2026')).toBeTruthy();
  expect(screen.getByText('September 2026')).toBeTruthy();

  expect(screen.getByText('Matched with Jess')).toBeTruthy();
  expect(screen.getByText('Nov 14, 2026 at 7:32 PM')).toBeTruthy();
  expect(screen.getByText('Still matched')).toBeTruthy();

  expect(screen.getByText('Matched with Marcus')).toBeTruthy();
  expect(screen.getByText('Oct 2, 2026 at 9:00 AM')).toBeTruthy();
  expect(screen.getByText('You unmatched Marcus')).toBeTruthy();
  expect(screen.getByText('Oct 5, 2026 at 9:30 AM')).toBeTruthy();
  expect(screen.getByText('Lasted 3 days')).toBeTruthy();
});

it('totals matches, still going and ended', async () => {
  await setup();
  expect(screen.getByLabelText('Matches: 3')).toBeTruthy();
  expect(screen.getByLabelText('Still going: 1')).toBeTruthy();
  expect(screen.getByLabelText('Ended: 2')).toBeTruthy();
});

it('keeps people who left Ick on the timeline without a name', async () => {
  await setup();
  expect(screen.getByText('Matched with someone who has since left Ick')).toBeTruthy();
  expect(screen.getByText('Your match with someone who has since left Ick ended')).toBeTruthy();
});

it('opens the chat only for a match that is still going', async () => {
  const { onOpen } = await setup();
  await fireEvent.press(screen.getByLabelText('Matched with Jess, Nov 14, 2026 at 7:32 PM. Open chat'));
  expect(onOpen).toHaveBeenCalledWith(current);

  // Ended matches are not buttons: there's no chat left to open.
  expect(screen.queryByLabelText(/Marcus.*Open chat/)).toBeNull();
  expect(screen.getAllByText('Still matched')).toHaveLength(1);
});

it('shows nothing while the first load is still running', async () => {
  await setup({ entries: [], loaded: false });
  expect(screen.queryByText('No history yet')).toBeNull();
});

it('explains an empty history once it has loaded', async () => {
  await setup({ entries: [] });
  expect(screen.getByText('No history yet')).toBeTruthy();
  expect(screen.queryByLabelText(/Matches:/)).toBeNull();
});

it('says so when history could not be loaded', async () => {
  await setup({ entries: [], error: 'No connection. Check your internet and try again.' });
  expect(screen.getByText("Couldn't load your history")).toBeTruthy();
  expect(screen.getByText('No connection. Check your internet and try again.')).toBeTruthy();
});
