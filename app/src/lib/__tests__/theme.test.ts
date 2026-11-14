import { categoryMeta, colors, brand, tint } from '../theme';
import { CATEGORIES, GENDERS, INTERESTS, genderLabel } from '../types';

describe('tint', () => {
  it.each([
    [1, 'ff'],
    [0, '00'],
    [0.5, '80'],
    [0.1, '1a'],
  ])('alpha %p → suffix %p', (alpha, suffix) => {
    expect(tint('#123456', alpha)).toBe(`#123456${suffix}`);
  });
});

describe('categoryMeta', () => {
  it('has an emoji, label and valid color for every category', () => {
    for (const c of CATEGORIES) {
      const m = categoryMeta[c];
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.emoji.length).toBeGreaterThan(0);
      expect(m.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('covers exactly the categories the API knows about', () => {
    expect(Object.keys(categoryMeta).sort()).toEqual([...CATEGORIES].sort());
  });
});

describe('palette', () => {
  it('uses valid hex colors throughout', () => {
    for (const c of [...Object.values(colors), ...brand]) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('types', () => {
  it('mirrors the API enums', () => {
    expect(GENDERS).toEqual(expect.arrayContaining(['Man', 'Woman', 'NonBinary']));
    expect(INTERESTS).toEqual(expect.arrayContaining(['Men', 'Women', 'Everyone']));
    expect(CATEGORIES).toHaveLength(8);
  });

  it('shows NonBinary in a friendly way', () => {
    expect(genderLabel('NonBinary')).toBe('Non-binary');
    expect(genderLabel('Woman')).toBe('Woman');
  });
});
