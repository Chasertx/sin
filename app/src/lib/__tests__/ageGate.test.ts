import * as SecureStore from 'expo-secure-store';

import {
  MIN_AGE,
  ageOn,
  checkBirthDate,
  formatBirthDigits,
  loadAgeGate,
  saveAgeBlocked,
  saveAgePassed,
  turnsAdultOn,
} from '../ageGate';

const today = new Date(2026, 10, 15); // Nov 15, 2026
const stored = () => (SecureStore as unknown as { __store: Map<string, string> }).__store.get('ick.ageGate');

describe('age', () => {
  it.each([
    [{ year: 2008, month: 11, day: 15 }, 18], // 18th birthday is today
    [{ year: 2008, month: 11, day: 16 }, 17], // 18 tomorrow
    [{ year: 2008, month: 12, day: 1 }, 17],
    [{ year: 2008, month: 1, day: 1 }, 18],
    [{ year: 1990, month: 11, day: 14 }, 36],
    [{ year: 2026, month: 11, day: 15 }, 0],
  ])('counts whole years (%#)', (birth, age) => expect(ageOn(birth, today)).toBe(age));

  it('treats a Feb 29 birthday as not yet reached on Feb 28', () => {
    const leap = { year: 2008, month: 2, day: 29 };
    expect(ageOn(leap, new Date(2026, 1, 28))).toBe(17);
    expect(ageOn(leap, new Date(2026, 2, 1))).toBe(18);
    expect(turnsAdultOn(leap)).toBe('2026-03-01');
  });
});

describe('reading the date boxes', () => {
  it('lets in someone who is 18 today and turns away someone who is 18 tomorrow', () => {
    expect(checkBirthDate('11', '15', '2008', today)).toMatchObject({ ok: true, age: 18, adult: true });
    expect(checkBirthDate('11', '16', '2008', today)).toMatchObject({ ok: true, age: 17, adult: false });
    expect(MIN_AGE).toBe(18);
  });

  it('accepts single digits and stray spaces', () => {
    expect(checkBirthDate(' 3', '7 ', '1995', today)).toMatchObject({ ok: true, birth: { year: 1995, month: 3, day: 7 }, adult: true });
  });

  it.each([
    ['', '', '', 'full date'],
    ['11', '', '2000', 'full date'],
    ['ab', '10', '2000', 'full date'],
    ['11', '15', '90', 'four digits'],
    ['2', '30', '2000', "doesn't exist"],
    ['13', '1', '2000', "doesn't exist"],
    ['0', '10', '2000', "doesn't exist"],
    ['2', '29', '2001', "doesn't exist"], // not a leap year
    ['11', '16', '2026', "doesn't look right"], // tomorrow
    ['1', '1', '1850', "doesn't look right"],
  ])('rejects %s/%s/%s', (m, d, y, message) => {
    const result = checkBirthDate(m, d, y, today);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining(message) });
  });

  it('accepts a real leap day', () => {
    expect(checkBirthDate('2', '29', '2000', today)).toMatchObject({ ok: true, age: 26 });
  });
});

describe('the date box', () => {
  it.each([
    ['', ''],
    ['0', '0'],
    ['03', '03'],
    ['030', '03 / 0'],
    ['0307', '03 / 07'],
    ['03071', '03 / 07 / 1'],
    ['03071995', '03 / 07 / 1995'],
    ['030719951234', '03 / 07 / 1995'], // extra digits are dropped
    ['03 / 07 / 19', '03 / 07 / 19'], // already formatted text is fine too
  ])('shows %j as %j', (digits, shown) => expect(formatBirthDigits(digits)).toBe(shown));

  it('never ends in a separator, so backspace always removes a digit', () => {
    for (let n = 0; n <= 8; n++) expect(formatBirthDigits('03071995'.slice(0, n))).not.toMatch(/[ /]$/);
  });
});

describe('what the phone remembers', () => {
  it('asks when nothing has been answered yet', async () => {
    expect(await loadAgeGate(today)).toBe('unknown');
  });

  it('remembers a pass without keeping the birth date', async () => {
    await saveAgePassed();
    expect(await loadAgeGate(today)).toBe('passed');
    expect(stored()).toBe('{"passed":true}');
  });

  it('keeps someone under 18 out until the day they turn 18', async () => {
    await saveAgeBlocked({ year: 2009, month: 3, day: 10 });
    expect(await loadAgeGate(today)).toBe('blocked');
    expect(await loadAgeGate(new Date(2027, 2, 9))).toBe('blocked');
    expect(await loadAgeGate(new Date(2027, 2, 10))).toBe('unknown'); // 18th birthday: ask again
    expect(stored()).toBe('{"blockedUntil":"2027-03-10"}');
  });

  it('asks again rather than crashing on unreadable storage', async () => {
    await SecureStore.setItemAsync('ick.ageGate', 'not json');
    expect(await loadAgeGate(today)).toBe('unknown');
    await SecureStore.setItemAsync('ick.ageGate', '{"passed":"yes"}');
    expect(await loadAgeGate(today)).toBe('unknown');
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('no storage'));
    expect(await loadAgeGate(today)).toBe('unknown');
  });
});
