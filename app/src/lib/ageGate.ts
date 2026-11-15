import * as SecureStore from 'expo-secure-store';

/** Ick is for adults only. Nobody gets past the first screen without confirming this. */
export const MIN_AGE = 18;

const KEY = 'ick.ageGate';

export interface BirthDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
}

export type AgeGateStatus = 'passed' | 'blocked' | 'unknown';

/** What's remembered on the phone: only that they passed, or the day a too-young person turns 18. */
type Saved = { passed: true } | { blockedUntil: string };

/** Whole years between a birth date and today. */
export function ageOn(birth: BirthDate, today = new Date()) {
  let age = today.getFullYear() - birth.year;
  const hadBirthday =
    today.getMonth() + 1 > birth.month || (today.getMonth() + 1 === birth.month && today.getDate() >= birth.day);
  if (!hadBirthday) age--;
  return age;
}

export type BirthDateCheck =
  | { ok: true; birth: BirthDate; age: number; adult: boolean }
  | { ok: false; error: string };

/** Reads what was typed into the month, day and year boxes. */
export function checkBirthDate(month: string, day: string, year: string, today = new Date()): BirthDateCheck {
  const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
  const [m, d, y] = [whole(month), whole(day), whole(year)];
  if ([m, d, y].some(Number.isNaN)) return { ok: false, error: 'Enter your full date of birth.' };
  if (year.trim().length !== 4) return { ok: false, error: 'Enter all four digits of the year.' };

  // A real calendar date (so no February 30th).
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d)
    return { ok: false, error: "That date doesn't exist. Check the month and day." };

  const birth = { year: y, month: m, day: d };
  const age = ageOn(birth, today);
  if (date > today || age > 120) return { ok: false, error: "That year doesn't look right." };
  return { ok: true, birth, age, adult: age >= MIN_AGE };
}

/** Shows the digits typed so far as a date in progress: "0307" becomes "03 / 07", up to "03 / 07 / 1995". */
export function formatBirthDigits(digits: string) {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join(' / ');
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The day someone with this birth date turns 18, as YYYY-MM-DD. (Feb 29 birthdays count from Mar 1.) */
export function turnsAdultOn(birth: BirthDate) {
  return dayKey(new Date(birth.year + MIN_AGE, birth.month - 1, birth.day));
}

/** What this phone remembers about the age check. A block lifts by itself on their 18th birthday. */
export async function loadAgeGate(today = new Date()): Promise<AgeGateStatus> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return 'unknown';
    const saved = JSON.parse(raw) as Saved;
    if ('passed' in saved && saved.passed === true) return 'passed';
    if ('blockedUntil' in saved && typeof saved.blockedUntil === 'string')
      return dayKey(today) >= saved.blockedUntil ? 'unknown' : 'blocked';
    return 'unknown';
  } catch {
    return 'unknown'; // unreadable or no storage: just ask again
  }
}

/** The birth date itself is never kept once someone has passed. */
export async function saveAgePassed() {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ passed: true } satisfies Saved)).catch(() => {});
}

/** Remembered so a different answer can't be tried straight away. */
export async function saveAgeBlocked(birth: BirthDate) {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ blockedUntil: turnsAdultOn(birth) } satisfies Saved)).catch(() => {});
}
