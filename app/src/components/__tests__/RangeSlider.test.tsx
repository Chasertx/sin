import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { RangeSlider } from '../RangeSlider';

const TRACK = 228; // laid-out width; thumbs travel 200 of it, so a 0-100 slider moves 1 per 2px

/** A slider that holds its own values, like a screen would. */
function Harness({ start, onChange, ...props }: { start: number[]; onChange?: (v: number[]) => void; min?: number; max?: number; step?: number; minGap?: number }) {
  const [values, setValues] = useState(start);
  return (
    <RangeSlider
      min={0}
      max={100}
      {...props}
      values={values}
      onChange={(v) => {
        setValues(v);
        onChange?.(v);
      }}
      labels={start.length === 2 ? ['Low', 'High'] : ['Value']}
      format={(v) => `${v} units`}
    />
  );
}

async function setup(props: Parameters<typeof Harness>[0]) {
  const onChange = jest.fn();
  const view = await render(<Harness {...props} onChange={onChange} />);
  await fireEvent(view.root!, 'layout', { nativeEvent: { layout: { width: TRACK, height: 44 } } });
  return onChange;
}

const drag = async (label: string, from: number, ...to: number[]) => {
  const thumb = screen.getByLabelText(label);
  await fireEvent(thumb, 'responderGrant', { nativeEvent: { pageX: from } });
  for (const x of to) await fireEvent(thumb, 'responderMove', { nativeEvent: { pageX: x } });
  await fireEvent(thumb, 'responderRelease', { nativeEvent: { pageX: to.at(-1) ?? from } });
};

const valueOf = (label: string) => screen.getByLabelText(label).props.accessibilityValue.text;

describe('single thumb', () => {
  it('follows the finger and snaps to steps', async () => {
    const onChange = await setup({ start: [50], step: 5 });
    await drag('Value', 100, 121); // +21px = +10.5 → snaps to 60
    expect(onChange).toHaveBeenLastCalledWith([60]);
    expect(valueOf('Value')).toBe('60 units');
  });

  it('stops at the ends', async () => {
    const onChange = await setup({ start: [50] });
    await drag('Value', 100, 900);
    expect(onChange).toHaveBeenLastCalledWith([100]);
    await drag('Value', 100, -900);
    expect(onChange).toHaveBeenLastCalledWith([0]);
  });

  it('does not report a change when the value is the same', async () => {
    const onChange = await setup({ start: [50], step: 10 });
    await drag('Value', 100, 103, 104);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing before it has been laid out', async () => {
    const onChange = jest.fn();
    await render(<Harness start={[50]} onChange={onChange} />);
    await drag('Value', 100, 160);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('range', () => {
  it('moves each end on its own', async () => {
    const onChange = await setup({ start: [20, 80] });
    await drag('Low', 50, 70); // +10
    expect(onChange).toHaveBeenLastCalledWith([30, 80]);
    await drag('High', 200, 180); // -10
    expect(onChange).toHaveBeenLastCalledWith([30, 70]);
  });

  it('pushes the other thumb along instead of crossing it', async () => {
    const onChange = await setup({ start: [20, 40], minGap: 5 });
    await drag('Low', 50, 150); // wants 70
    expect(onChange).toHaveBeenLastCalledWith([70, 75]);
    await drag('High', 200, 0); // wants -25
    expect(onChange).toHaveBeenLastCalledWith([0, 5]);
  });

  it('keeps the gap at the far end', async () => {
    const onChange = await setup({ start: [20, 40], minGap: 5 });
    await drag('Low', 50, 900);
    expect(onChange).toHaveBeenLastCalledWith([95, 100]);
  });
});

describe('accessibility', () => {
  it('announces each thumb and can be stepped without dragging', async () => {
    const onChange = await setup({ start: [20, 80], step: 2 });
    expect(valueOf('Low')).toBe('20 units');
    expect(valueOf('High')).toBe('80 units');

    await fireEvent(screen.getByLabelText('Low'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith([22, 80]);
    await fireEvent(screen.getByLabelText('High'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith([22, 78]);
  });
});
