import { formatHeight, type Preferences } from './types';

/** What the filter sheet's sliders can reach. An end stop means "no limit" on that side. */
export const AGE = { min: 18, max: 80 } as const;
export const HEIGHT = { min: 48, max: 84 } as const; // 4'0" to 7'0"

/** Distance isn't linear: fine steps nearby, big ones far away. The last stop is the whole country. */
export const DISTANCE_STOPS: (number | null)[] = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, null];

export const NO_FILTERS: Preferences = {
  minAge: AGE.min,
  maxAge: null,
  maxDistanceMiles: null,
  minHeightInches: null,
  maxHeightInches: null,
  ethnicities: [],
};

/**
 * The filters are edited on the Possibly Icks tab but applied on Discover. This counter is how
 * Discover notices, next time it's shown, that the people it already loaded are out of date.
 */
let version = 0;
export const filtersVersion = () => version;
export const markFiltersChanged = () => void version++;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Where each slider thumb sits for these preferences. */
export function toSliders(p: Preferences) {
  const nearest = DISTANCE_STOPS.findIndex((s) => s !== null && p.maxDistanceMiles !== null && s >= p.maxDistanceMiles);
  return {
    age: [clamp(p.minAge, AGE.min, AGE.max), clamp(p.maxAge ?? AGE.max, AGE.min, AGE.max)],
    height: [
      clamp(p.minHeightInches ?? HEIGHT.min, HEIGHT.min, HEIGHT.max),
      clamp(p.maxHeightInches ?? HEIGHT.max, HEIGHT.min, HEIGHT.max),
    ],
    distance: p.maxDistanceMiles === null || nearest < 0 ? DISTANCE_STOPS.length - 1 : nearest,
  };
}

export const withAge = (p: Preferences, [lo, hi]: number[]): Preferences => ({
  ...p,
  minAge: lo,
  maxAge: hi >= AGE.max ? null : hi,
});

export const withHeight = (p: Preferences, [lo, hi]: number[]): Preferences => ({
  ...p,
  minHeightInches: lo <= HEIGHT.min ? null : lo,
  maxHeightInches: hi >= HEIGHT.max ? null : hi,
});

export const withDistance = (p: Preferences, stop: number): Preferences => ({
  ...p,
  maxDistanceMiles: DISTANCE_STOPS[clamp(stop, 0, DISTANCE_STOPS.length - 1)],
});

export function describeAge(p: Preferences) {
  if (p.minAge <= AGE.min && p.maxAge === null) return 'Any age';
  return p.maxAge === null ? `${p.minAge}+` : `${p.minAge} – ${p.maxAge}`;
}

export function describeDistance(p: Preferences) {
  return p.maxDistanceMiles === null ? 'Anywhere in the US' : `Within ${p.maxDistanceMiles} miles`;
}

export function describeHeight(p: Preferences) {
  const { minHeightInches: lo, maxHeightInches: hi } = p;
  if (lo === null && hi === null) return 'Any height';
  if (hi === null) return `${formatHeight(lo!)} and up`;
  if (lo === null) return `Up to ${formatHeight(hi)}`;
  return `${formatHeight(lo)} – ${formatHeight(hi)}`;
}

export function describeEthnicities(p: Preferences) {
  return p.ethnicities.length === 0 ? 'Any ethnicity' : `${p.ethnicities.length} selected`;
}

/** How many of the four filters are narrowing things down (for the badge on the filter button). */
export function activeFilterCount(p: Preferences) {
  return [
    p.minAge > AGE.min || p.maxAge !== null,
    p.maxDistanceMiles !== null,
    p.minHeightInches !== null || p.maxHeightInches !== null,
    p.ethnicities.length > 0,
  ].filter(Boolean).length;
}
