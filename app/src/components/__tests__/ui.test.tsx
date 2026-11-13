import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { Avatar, Button, CategoryTag, ChipGroup, Field, Txt } from '../ui';

describe('Txt', () => {
  it('renders its children', async () => {
    await render(<Txt variant="title">Hello</Txt>);
    expect(screen.getByText('Hello')).toBeTruthy();
  });
});

describe('Button', () => {
  it.each(['gradient', 'white', 'ghost', 'dark'] as const)('%s variant calls onPress with a haptic tick', async (variant) => {
    const onPress = jest.fn();
    await render(<Button title="Go" variant={variant} onPress={onPress} />);
    await fireEvent.press(screen.getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(<Button title="Go" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByText('Go'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button title="Saving" loading onPress={onPress} />);
    await fireEvent.press(screen.getByText('Saving'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
  });
});

describe('Field', () => {
  it('shows a label and reports typing', async () => {
    const onChangeText = jest.fn();
    await render(<Field label="Email" placeholder="you@x.com" onChangeText={onChangeText} />);
    expect(screen.getByText('Email')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('you@x.com'), 'a@b.c');
    expect(onChangeText).toHaveBeenCalledWith('a@b.c');
  });
});

describe('ChipGroup', () => {
  it('renders every option and reports the one tapped', async () => {
    const onChange = jest.fn();
    await render(
      <ChipGroup label="I am" options={['Woman', 'Man', 'NonBinary'] as const} value="Woman" onChange={onChange}
        render={(o) => (o === 'NonBinary' ? 'Non-binary' : o)} />,
    );
    expect(screen.getByText('I am')).toBeTruthy();
    expect(screen.getByText('Non-binary')).toBeTruthy();
    await fireEvent.press(screen.getByText('Man'));
    expect(onChange).toHaveBeenCalledWith('Man');
  });
});

describe('CategoryTag', () => {
  it.each([
    ['Dealbreaker', '🚩 Dealbreaker'],
    ['Money', '💸 Money'],
    ['Other', '✨ Other'],
  ] as const)('%s → %s', async (category, text) => {
    await render(<CategoryTag category={category} />);
    expect(screen.getByText(text)).toBeTruthy();
  });
});

describe('Avatar', () => {
  it('shows the first initial when there is no photo', async () => {
    await render(<Avatar name="jess" />);
    expect(screen.getByText('J')).toBeTruthy();
    expect(screen.queryByTestId('expo-image')).toBeNull();
  });

  it('shows the photo when there is one', async () => {
    await render(<Avatar name="Jess" uri="https://x/p.jpg" />);
    expect(screen.getByTestId('expo-image')).toBeTruthy();
    expect(screen.queryByText('J')).toBeNull();
  });

  it('gives different people different colors', async () => {
    const colorOf = async (name: string) => {
      const { toJSON, unmount } = await render(<Avatar name={name} />);
      const bg = (toJSON() as unknown as { props: { style: { backgroundColor: string } } }).props.style.backgroundColor;
      await unmount();
      return bg;
    };
    // Regression: Dana and Jess both came out blue on the match screen.
    expect(await colorOf('Dana')).not.toBe(await colorOf('Jess'));
    const colors = new Set<string>();
    for (const n of ['Dana', 'Jess', 'Marcus', 'Priya', 'Leo', 'Sam']) colors.add(await colorOf(n));
    expect(colors.size).toBeGreaterThanOrEqual(3);
  });
});
