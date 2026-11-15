import {
  AGE,
  DISTANCE_STOPS,
  HEIGHT,
  NO_FILTERS,
  activeFilterCount,
  describeAge,
  describeDistance,
  describeEthnicities,
  describeHeight,
  filtersVersion,
  markFiltersChanged,
  toSliders,
  withAge,
  withDistance,
  withHeight,
} from '../filters';
import { ETHNICITIES, ethnicityLabel, formatHeight, type Preferences } from '../types';

const prefs = (overrides: Partial<Preferences> = {}): Preferences => ({ ...NO_FILTERS, ...overrides });
const lastStop = DISTANCE_STOPS.length - 1;

describe('no filters', () => {
  it('reads as wide open and counts as nothing on', () => {
    expect(describeAge(NO_FILTERS)).toBe('Any age');
    expect(describeDistance(NO_FILTERS)).toBe('Anywhere in the US');
    expect(describeHeight(NO_FILTERS)).toBe('Any height');
    expect(describeEthnicities(NO_FILTERS)).toBe('Any ethnicity');
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
  });

  it('puts every thumb at its end stop', () => {
    expect(toSliders(NO_FILTERS)).toEqual({ age: [AGE.min, AGE.max], height: [HEIGHT.min, HEIGHT.max], distance: lastStop });
  });
});

describe('age', () => {
  it('treats the top of the slider as no upper limit', () => {
    expect(withAge(NO_FILTERS, [25, AGE.max])).toMatchObject({ minAge: 25, maxAge: null });
    expect(withAge(NO_FILTERS, [25, 40])).toMatchObject({ minAge: 25, maxAge: 40 });
  });

  it.each([
    [prefs({ minAge: 25, maxAge: 40 }), '25 – 40'],
    [prefs({ minAge: 30 }), '30+'],
    [prefs({ maxAge: 35 }), '18 – 35'],
  ])('describes %#', (p, text) => expect(describeAge(p)).toBe(text));

  it('keeps thumbs on the track for ages beyond it', () => {
    expect(toSliders(prefs({ minAge: 30, maxAge: 95 })).age).toEqual([30, AGE.max]);
  });
});

describe('distance', () => {
  it('ends with the whole country', () => {
    expect(DISTANCE_STOPS.at(-1)).toBeNull();
    expect(withDistance(NO_FILTERS, lastStop).maxDistanceMiles).toBeNull();
    expect(withDistance(NO_FILTERS, 0).maxDistanceMiles).toBe(5);
    expect(withDistance(NO_FILTERS, 99).maxDistanceMiles).toBeNull(); // off the end is clamped
  });

  it('round-trips every stop', () => {
    DISTANCE_STOPS.forEach((_, stop) => expect(toSliders(withDistance(NO_FILTERS, stop)).distance).toBe(stop));
  });

  it('snaps a distance between stops up to the next one, and anything huge to "anywhere"', () => {
    expect(DISTANCE_STOPS[toSliders(prefs({ maxDistanceMiles: 60 })).distance]).toBe(75);
    expect(toSliders(prefs({ maxDistanceMiles: 2000 })).distance).toBe(lastStop);
  });

  it('describes a limit in miles', () => {
    expect(describeDistance(prefs({ maxDistanceMiles: 25 }))).toBe('Within 25 miles');
  });
});

describe('height', () => {
  it('treats either end of the slider as no limit on that side', () => {
    expect(withHeight(NO_FILTERS, [HEIGHT.min, HEIGHT.max])).toMatchObject({ minHeightInches: null, maxHeightInches: null });
    expect(withHeight(NO_FILTERS, [64, HEIGHT.max])).toMatchObject({ minHeightInches: 64, maxHeightInches: null });
    expect(withHeight(NO_FILTERS, [HEIGHT.min, 70])).toMatchObject({ minHeightInches: null, maxHeightInches: 70 });
  });

  it.each([
    [prefs({ minHeightInches: 64, maxHeightInches: 74 }), `5'4" – 6'2"`],
    [prefs({ minHeightInches: 70 }), `5'10" and up`],
    [prefs({ maxHeightInches: 66 }), `Up to 5'6"`],
  ])('describes %#', (p, text) => expect(describeHeight(p)).toBe(text));

  it('formats feet and inches', () => {
    expect(formatHeight(48)).toBe(`4'0"`);
    expect(formatHeight(71)).toBe(`5'11"`);
    expect(formatHeight(72)).toBe(`6'0"`);
  });
});

describe('ethnicity', () => {
  it('counts what is selected', () => {
    expect(describeEthnicities(prefs({ ethnicities: ['Asian', 'White'] }))).toBe('2 selected');
  });

  it('has a readable label for every option the API knows', () => {
    expect(ETHNICITIES).toHaveLength(10);
    for (const e of ETHNICITIES) expect(ethnicityLabel(e).length).toBeGreaterThan(0);
    expect(ethnicityLabel('HispanicLatino')).toBe('Hispanic / Latino');
  });
});

describe('activeFilterCount', () => {
  it('counts each kind of filter once', () => {
    expect(activeFilterCount(prefs({ minAge: 21 }))).toBe(1);
    expect(activeFilterCount(prefs({ minAge: 21, maxAge: 30 }))).toBe(1);
    expect(
      activeFilterCount({ minAge: 21, maxAge: 30, maxDistanceMiles: 10, minHeightInches: 60, maxHeightInches: 70, ethnicities: ['Other'] }),
    ).toBe(4);
  });
});

it('markFiltersChanged bumps the version Discover watches', () => {
  const before = filtersVersion();
  markFiltersChanged();
  expect(filtersVersion()).toBe(before + 1);
});
