import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { NO_FILTERS } from '@/lib/filters';
import type { Preferences } from '@/lib/types';

import { FilterSheet } from '../FilterSheet';

const step = (label: string, actionName: 'increment' | 'decrement', times = 1) => async () => {
  for (let i = 0; i < times; i++)
    await fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName } });
};

async function open(current: Preferences = NO_FILTERS) {
  const onApply = jest.fn(async () => {});
  const onClose = jest.fn();
  const view = await render(<FilterSheet visible current={current} onClose={onClose} onApply={onApply} />);
  return { onApply, onClose, view };
}

it('starts from the filters in force', async () => {
  await open({ minAge: 25, maxAge: 40, maxDistanceMiles: 50, minHeightInches: 64, maxHeightInches: null, ethnicities: ['Black'] });
  expect(screen.getByText('25 – 40')).toBeTruthy();
  expect(screen.getByText('Within 50 miles')).toBeTruthy();
  expect(screen.getByText(`5'4" and up`)).toBeTruthy();
  expect(screen.getByText('1 selected')).toBeTruthy();
  expect(screen.getByText("Only people who've added their height will show up.")).toBeTruthy();
  expect(screen.getByText("Only people who've shared theirs will show up.")).toBeTruthy();
});

it('says everything is open when nothing is filtered, with no reset to offer', async () => {
  await open();
  expect(screen.getByText('Any age')).toBeTruthy();
  expect(screen.getByText('Anywhere in the US')).toBeTruthy();
  expect(screen.getByText('Any height')).toBeTruthy();
  expect(screen.getByText('Any ethnicity')).toBeTruthy();
  expect(screen.queryByLabelText('Reset filters')).toBeNull();
});

it('builds up all four filters and hands them over on save', async () => {
  const { onApply } = await open();

  await step('Youngest age', 'increment', 3)(); // 18 → 21
  await step('Oldest age', 'decrement', 2)(); // 80+ → 78
  await step('Furthest distance', 'decrement')(); // anywhere → 500 miles
  await step('Shortest height', 'increment', 2)(); // 4'0" → 4'2"
  await fireEvent.press(screen.getByText('Asian'));
  await fireEvent.press(screen.getByText('Pacific Islander'));
  await fireEvent.press(screen.getByText('Asian')); // changed my mind

  expect(screen.getByText('21 – 78')).toBeTruthy();
  expect(screen.getByText('Within 500 miles')).toBeTruthy();
  expect(screen.getByText(`4'2" and up`)).toBeTruthy();

  await fireEvent.press(screen.getByText('Save filters'));
  await waitFor(() =>
    expect(onApply).toHaveBeenCalledWith({
      minAge: 21,
      maxAge: 78,
      maxDistanceMiles: 500,
      minHeightInches: 50,
      maxHeightInches: null,
      ethnicities: ['PacificIslander'],
    }),
  );
});

it('reset clears everything', async () => {
  const { onApply } = await open({ minAge: 30, maxAge: 35, maxDistanceMiles: 10, minHeightInches: 60, maxHeightInches: 70, ethnicities: ['White'] });
  await fireEvent.press(screen.getByLabelText('Reset filters'));
  expect(screen.getByText('Any age')).toBeTruthy();
  await fireEvent.press(screen.getByText('Save filters'));
  await waitFor(() => expect(onApply).toHaveBeenCalledWith(NO_FILTERS));
});

it('closing throws the edits away', async () => {
  const { onApply, onClose, view } = await open();
  await fireEvent.press(screen.getByText('White'));
  await fireEvent.press(screen.getByLabelText('Close filters'));
  expect(onClose).toHaveBeenCalled();
  expect(onApply).not.toHaveBeenCalled();

  // Reopened: back to what was saved.
  await view.rerender(<FilterSheet visible={false} current={NO_FILTERS} onClose={onClose} onApply={onApply} />);
  await view.rerender(<FilterSheet visible current={NO_FILTERS} onClose={onClose} onApply={onApply} />);
  expect(screen.getByText('Any ethnicity')).toBeTruthy();
});

it('uses the label it is given for the save button', async () => {
  await render(<FilterSheet visible current={NO_FILTERS} onClose={jest.fn()} onApply={jest.fn(async () => {})} applyLabel="Show people" />);
  expect(screen.getByText('Show people')).toBeTruthy();
});
