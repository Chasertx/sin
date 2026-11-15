import { act, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { createRef } from 'react';

import type { Profile } from '@/lib/types';

import { PeekCard, SwipeCard, cardDetails, type SwipeCardHandle } from '../SwipeCard';

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'p1',
  displayName: 'Jess',
  age: 35,
  gender: 'Woman',
  interestedIn: 'Everyone',
  headline: 'I have opinions about your font choices.',
  photoUrl: null,
  flaws: [
    { id: 'f1', category: 'Habits', text: 'I spoil movie endings.' },
    { id: 'f2', category: 'Hygiene', text: 'I re-wear socks.' },
  ],
  ...overrides,
});

const flaws = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, category: 'Quirks' as const, text: `quirk ${i}` }));

it('shows name, age, headline and confessions', async () => {
  await render(<SwipeCard profile={profile()} onSwiped={jest.fn()} />);
  expect(screen.getByText('Jess')).toBeTruthy();
  expect(screen.getByText('35')).toBeTruthy();
  expect(screen.getByText('“I have opinions about your font choices.”')).toBeTruthy();
  expect(screen.getByText('I spoil movie endings.')).toBeTruthy();
  expect(screen.getByText('🧼 Hygiene')).toBeTruthy();
});

it('omits the headline bubble when there is none', async () => {
  await render(<SwipeCard profile={profile({ headline: null })} onSwiped={jest.fn()} />);
  expect(screen.queryByText(/“/)).toBeNull();
});

it('shows at most two confessions (so nothing gets cut off) and counts the rest', async () => {
  await render(<SwipeCard profile={profile({ flaws: flaws(5) })} onSwiped={jest.fn()} />);
  expect(screen.getByText('quirk 1')).toBeTruthy();
  expect(screen.queryByText('quirk 2')).toBeNull();
  expect(screen.getByText('+ 3 more confessions')).toBeTruthy();
});

it('uses singular wording for one extra confession', async () => {
  await render(<SwipeCard profile={profile({ flaws: flaws(3) })} onSwiped={jest.fn()} />);
  expect(screen.getByText('+ 1 more confession')).toBeTruthy();
});

it('shows the photo when there is one, otherwise a placeholder', async () => {
  const { unmount } = await render(<SwipeCard profile={profile()} onSwiped={jest.fn()} />);
  expect(screen.getByText(/No photo/)).toBeTruthy();
  await unmount();

  await render(<SwipeCard profile={profile({ photoUrl: 'https://x/p.jpg' })} onSwiped={jest.fn()} />);
  expect(screen.queryByText(/No photo/)).toBeNull();
  expect(screen.getByTestId('expo-image')).toBeTruthy();
});

it.each([true, false])('swiping via the buttons reports %p with a haptic', async (canHandleIt) => {
  const onSwiped = jest.fn();
  const ref = createRef<SwipeCardHandle>();
  await render(<SwipeCard ref={ref} profile={profile()} onSwiped={onSwiped} />);

  await act(async () => ref.current!.swipe(canHandleIt));

  expect(onSwiped).toHaveBeenCalledWith(canHandleIt);
  expect(Haptics.impactAsync).toHaveBeenCalled();
});

it('has I CAN HANDLE IT / TOO MUCH stamps ready for dragging', async () => {
  await render(<SwipeCard profile={profile()} onSwiped={jest.fn()} />);
  expect(screen.getByText('I CAN\nHANDLE IT')).toBeTruthy();
  expect(screen.getByText('TOO\nMUCH')).toBeTruthy();
});

it('PeekCard renders the next profile without gestures', async () => {
  await render(<PeekCard profile={profile({ displayName: 'Next' })} />);
  expect(screen.getByText('Next')).toBeTruthy();
  expect(screen.queryByText('TOO\nMUCH')).toBeNull();
});

describe('distance and height', () => {
  it('shows how far away someone is and their height', async () => {
    await render(<SwipeCard profile={profile({ distanceMiles: 12, heightInches: 67 })} onSwiped={jest.fn()} />);
    expect(screen.getByText(`12 miles away · 5'7"`)).toBeTruthy();
  });

  it.each([
    [{ distanceMiles: 1 }, 'Nearby'],
    [{ distanceMiles: 340, heightInches: null }, '340 miles away'],
    [{ heightInches: 74 }, `6'2"`],
  ])('copes with only one of them: %p', (extra, text) => {
    expect(cardDetails(profile(extra))).toBe(text);
  });

  it('leaves the line out when there is nothing to say', async () => {
    await render(<SwipeCard profile={profile()} onSwiped={jest.fn()} />);
    expect(cardDetails(profile())).toBe('');
    expect(screen.queryByText(/miles away|Nearby/)).toBeNull();
  });
});
