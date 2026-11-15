import type { MatchHistoryEntry } from './types';

/** One moment on the History timeline: a match starting, or a match ending. */
export interface TimelineEvent {
  key: string;
  kind: 'matched' | 'ended';
  /** ISO time the event happened. */
  at: string;
  entry: MatchHistoryEntry;
}

export interface TimelineSection {
  /** "November 2026" */
  title: string;
  data: TimelineEvent[];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Every match becomes a "matched" event, plus an "ended" event if it's over. Newest first. */
export function toEvents(entries: MatchHistoryEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const entry of entries) {
    events.push({ key: `${entry.id}-matched`, kind: 'matched', at: entry.matchedAt, entry });
    if (entry.endedAt) events.push({ key: `${entry.id}-ended`, kind: 'ended', at: entry.endedAt, entry });
  }
  return events.sort((a, b) => {
    const diff = Date.parse(b.at) - Date.parse(a.at);
    if (diff !== 0) return diff;
    // Same instant: an ending sits above the match it ended.
    return a.kind === b.kind ? 0 : a.kind === 'ended' ? -1 : 1;
  });
}

/** The events grouped by the month they happened in (in the phone's own time zone). */
export function buildTimeline(entries: MatchHistoryEntry[]): TimelineSection[] {
  const sections: TimelineSection[] = [];
  for (const event of toEvents(entries)) {
    const d = new Date(event.at);
    const title = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const last = sections.at(-1);
    if (last?.title === title) last.data.push(event);
    else sections.push({ title, data: [event] });
  }
  return sections;
}

export function summarize(entries: MatchHistoryEntry[]) {
  const ended = entries.filter((e) => e.endedAt).length;
  return { total: entries.length, current: entries.length - ended, ended };
}

/** People who deleted their account stay on the timeline without a name. */
export const personName = (entry: MatchHistoryEntry) => entry.otherName ?? 'someone who has since left Ick';

export function eventTitle(event: TimelineEvent) {
  const who = personName(event.entry);
  if (event.kind === 'matched') return `Matched with ${who}`;
  return event.entry.endedByMe ? `You unmatched ${who}` : `Your match with ${who} ended`;
}

/** "Nov 14, 2026 at 7:32 PM", in the phone's own time zone. */
export function formatWhen(iso: string) {
  const d = new Date(iso);
  const hour = d.getHours() % 12 || 12;
  const minute = String(d.getMinutes()).padStart(2, '0');
  const half = d.getHours() < 12 ? 'AM' : 'PM';
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()} at ${hour}:${minute} ${half}`;
}

/** How long a match went on for: "Lasted 3 days". */
export function formatLasted(matchedAt: string, endedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(matchedAt)) / 60_000));
  const plural = (n: number, unit: string) => `Lasted ${n} ${unit}${n === 1 ? '' : 's'}`;
  if (minutes < 1) return 'Lasted less than a minute';
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return plural(days, 'day');
  if (days < 365) return plural(Math.floor(days / 30), 'month');
  return plural(Math.floor(days / 365), 'year');
}
