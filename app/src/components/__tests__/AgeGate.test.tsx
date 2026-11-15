import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { loadAgeGate } from '@/lib/ageGate';

import { AgeGate } from '../AgeGate';

const setup = async (blocked = false) => {
  const onPassed = jest.fn();
  await render(<AgeGate blocked={blocked} onPassed={onPassed} />);
  return { onPassed };
};

const box = () => screen.getByLabelText('Date of birth');

/** Types a date the way a person would: digits only, the box adds the separators. */
const enter = async (month: string, day: string, year: string) => {
  await fireEvent.changeText(box(), month.padStart(2, '0') + day.padStart(2, '0') + year);
  await fireEvent.press(screen.getByText('Continue'));
};

/** A birth date that makes someone exactly `years` old today (plus `days` more days until their birthday). */
const bornYearsAgo = (years: number, daysUntilBirthday = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + daysUntilBirthday);
  return [String(d.getMonth() + 1), String(d.getDate()), String(d.getFullYear())] as const;
};

it('asks for a date of birth before anything else', async () => {
  await setup();
  expect(screen.getByText('When were you born?')).toBeTruthy();
  expect(screen.getByText(/never sent to us/)).toBeTruthy();
});

it('lets an adult in and remembers it', async () => {
  const { onPassed } = await setup();
  await enter('3', '7', '1995');
  await waitFor(() => expect(onPassed).toHaveBeenCalledTimes(1));
  expect(await loadAgeGate()).toBe('passed');
});

it('lets in someone who turns 18 today', async () => {
  const { onPassed } = await setup();
  await enter(...bornYearsAgo(18));
  await waitFor(() => expect(onPassed).toHaveBeenCalled());
});

it('turns away someone who is 18 tomorrow, and remembers that too', async () => {
  const { onPassed } = await setup();
  await enter(...bornYearsAgo(18, 1));

  expect(await screen.findByText('Ick is for adults only')).toBeTruthy();
  expect(onPassed).not.toHaveBeenCalled();
  expect(await loadAgeGate()).toBe('blocked');
  // No way to simply try again with a different date.
  expect(screen.queryByText('Continue')).toBeNull();
  expect(screen.queryByLabelText('Date of birth')).toBeNull();
});

it('stays shut on a phone that already gave an under-18 date', async () => {
  const { onPassed } = await setup(true);
  expect(screen.getByText('Ick is for adults only')).toBeTruthy();
  expect(screen.queryByText('When were you born?')).toBeNull();
  expect(onPassed).not.toHaveBeenCalled();
});

it('asks for a proper date instead of guessing', async () => {
  const { onPassed } = await setup();
  await fireEvent.press(screen.getByText('Continue'));
  expect(screen.getByText(/Enter your full date of birth/)).toBeTruthy();

  await fireEvent.changeText(box(), '0307199'); // a digit short
  await fireEvent.press(screen.getByText('Continue'));
  expect(screen.getByText(/Enter your full date of birth/)).toBeTruthy();

  await enter('2', '30', '1995');
  expect(screen.getByText("That date doesn't exist. Check the month and day.")).toBeTruthy();
  expect(onPassed).not.toHaveBeenCalled();
  expect(await loadAgeGate()).toBe('unknown');
});

it('formats the date as it is typed and ignores anything that is not a digit', async () => {
  await setup();
  await fireEvent.changeText(box(), '0307');
  expect(box().props.value).toBe('03 / 07');
  await fireEvent.changeText(box(), '03 / 07 / 19x9a5 77');
  expect(box().props.value).toBe('03 / 07 / 1995');
  // Backspacing through a separator removes the digit before it.
  await fireEvent.changeText(box(), '03 / 07 /');
  expect(box().props.value).toBe('03 / 07');
});

it('clears the error once the date is being corrected', async () => {
  await setup();
  await fireEvent.press(screen.getByText('Continue'));
  expect(screen.getByText(/Enter your full date of birth/)).toBeTruthy();
  await fireEvent.changeText(box(), '03');
  expect(screen.queryByText(/Enter your full date of birth/)).toBeNull();
});
