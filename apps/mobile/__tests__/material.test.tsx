import { materialTier } from '@/components/Material';

describe('T-UNIT-R2-MAT-01 materialTier picks the surface a phone can render', () => {
  it('uses Liquid Glass on iOS when the API is there', () => {
    expect(materialTier({ os: 'ios', glass: true, reduceTransparency: false })).toBe('glass');
  });

  it('falls back to blur on iOS without glass', () => {
    expect(materialTier({ os: 'ios', glass: false, reduceTransparency: false })).toBe('blur');
  });

  it('is solid on Android and web', () => {
    expect(materialTier({ os: 'android', glass: false, reduceTransparency: false })).toBe('solid');
    expect(materialTier({ os: 'web', glass: false, reduceTransparency: false })).toBe('solid');
  });

  it('is solid whenever Reduce Transparency is on', () => {
    expect(materialTier({ os: 'ios', glass: true, reduceTransparency: true })).toBe('solid');
    expect(materialTier({ os: 'ios', glass: false, reduceTransparency: true })).toBe('solid');
  });
});
