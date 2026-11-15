import { buildTimeline, eventTitle, formatLasted, formatWhen, summarize, toEvents } from '../history';
import type { MatchHistoryEntry } from '../types';

/** Local time, so these read the same in any time zone the tests run in. */
const at = (month: number, day: number, hour = 12, minute = 0, year = 2026) => new Date(year, month - 1, day, hour, minute).toISOString();

const entry = (overrides: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry => ({
  id: 'm-1',
  otherName: 'Jess',
  otherPhotoUrl: null,
  matchedAt: at(11, 3),
  endedAt: null,
  endedByMe: false,
  matchId: 'match-1',
  otherUserId: 'u-1',
  ...overrides,
});

const ended = (overrides: Partial<MatchHistoryEntry> = {}) =>
  entry({ id: 'p-1', matchId: null, endedAt: at(11, 9), endedByMe: true, ...overrides });

describe('events', () => {
  it('gives a current match one event and an ended match two', () => {
    expect(toEvents([entry()]).map((e) => e.kind)).toEqual(['matched']);
    expect(toEvents([ended()]).map((e) => e.kind)).toEqual(['ended', 'matched']);
  });

  it('orders everything newest first, whoever it belongs to', () => {
    const events = toEvents([
      ended({ id: 'p-old', otherName: 'Old', matchedAt: at(9, 1), endedAt: at(11, 20) }),
      entry({ id: 'm-new', otherName: 'New', matchedAt: at(11, 10) }),
    ]);
    expect(events.map((e) => `${e.kind} ${e.entry.otherName}`)).toEqual(['ended Old', 'matched New', 'matched Old']);
    expect(new Set(events.map((e) => e.key)).size).toBe(3);
  });

  it('puts an ending above its own match when both happened at the same instant', () => {
    const same = at(11, 3);
    expect(toEvents([ended({ matchedAt: same, endedAt: same })]).map((e) => e.kind)).toEqual(['ended', 'matched']);
  });
});

describe('timeline', () => {
  it('groups events by month, newest month first', () => {
    const sections = buildTimeline([
      ended({ id: 'p-1', matchedAt: at(10, 28), endedAt: at(11, 2) }),
      entry({ id: 'm-2', matchedAt: at(11, 14) }),
      entry({ id: 'm-3', matchedAt: at(12, 30, 9, 0, 2025) }),
    ]);
    expect(sections.map((s) => [s.title, s.data.length])).toEqual([
      ['November 2026', 2],
      ['October 2026', 1],
      ['December 2025', 1],
    ]);
  });

  it('is empty when there is no history', () => {
    expect(buildTimeline([])).toEqual([]);
  });

  it('counts matches, still going and ended', () => {
    expect(summarize([entry(), ended(), ended({ id: 'p-2' })])).toEqual({ total: 3, current: 1, ended: 2 });
    expect(summarize([])).toEqual({ total: 0, current: 0, ended: 0 });
  });
});

describe('wording', () => {
  const [endedEvent, matchedEvent] = toEvents([ended()]);

  it('says who was matched and who ended it', () => {
    expect(eventTitle(matchedEvent)).toBe('Matched with Jess');
    expect(eventTitle(endedEvent)).toBe('You unmatched Jess');
    expect(eventTitle(toEvents([ended({ endedByMe: false })])[0])).toBe('Your match with Jess ended');
  });

  it('keeps people who deleted their account, without a name', () => {
    const [end, start] = toEvents([ended({ otherName: null, otherUserId: null, endedByMe: false })]);
    expect(eventTitle(start)).toBe('Matched with someone who has since left Ick');
    expect(eventTitle(end)).toBe('Your match with someone who has since left Ick ended');
  });

  it.each([
    [at(11, 14, 19, 32), 'Nov 14, 2026 at 7:32 PM'],
    [at(1, 5, 0, 5), 'Jan 5, 2026 at 12:05 AM'],
    [at(6, 30, 12, 0), 'Jun 30, 2026 at 12:00 PM'],
  ])('formats %s', (iso, text) => expect(formatWhen(iso)).toBe(text));

  it.each([
    [at(11, 3, 12, 0), at(11, 3, 12, 0), 'Lasted less than a minute'],
    [at(11, 3, 12, 0), at(11, 3, 12, 1), 'Lasted 1 minute'],
    [at(11, 3, 12, 0), at(11, 3, 12, 45), 'Lasted 45 minutes'],
    [at(11, 3, 12, 0), at(11, 3, 13, 30), 'Lasted 1 hour'],
    [at(11, 3, 12, 0), at(11, 4, 11, 0), 'Lasted 23 hours'],
    [at(11, 3, 12, 0), at(11, 6, 13, 0), 'Lasted 3 days'],
    [at(6, 1), at(9, 5), 'Lasted 3 months'],
    [at(1, 1, 12, 0, 2024), at(3, 1), 'Lasted 2 years'],
  ])('measures how long a match lasted (%#)', (from, to, text) => expect(formatLasted(from, to)).toBe(text));

  it('never reports a negative length if the clocks disagree', () => {
    expect(formatLasted(at(11, 3, 12, 5), at(11, 3, 12, 0))).toBe('Lasted less than a minute');
  });
});
