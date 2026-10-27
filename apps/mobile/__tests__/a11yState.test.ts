import { a11yState } from '@/lib/a11y';

describe('T-UNIT-A11Y-WEB a11yState', () => {
  it('passes accessibilityState through on phones', () => {
    expect(a11yState({ checked: true, disabled: false }, 'ios')).toEqual({
      accessibilityState: { checked: true, disabled: false },
    });
  });

  it('adds the same state as aria-* props on the web', () => {
    expect(
      a11yState(
        { checked: false, disabled: true, selected: true, expanded: false, busy: true },
        'web',
      ),
    ).toEqual({
      accessibilityState: {
        checked: false,
        disabled: true,
        selected: true,
        expanded: false,
        busy: true,
      },
      'aria-checked': false,
      'aria-disabled': true,
      'aria-selected': true,
      'aria-expanded': false,
      'aria-busy': true,
    });
  });

  it('leaves out keys that are not set, and nothing for undefined', () => {
    expect(a11yState({ selected: true }, 'web')).toEqual({
      accessibilityState: { selected: true },
      'aria-selected': true,
    });
    expect(a11yState(undefined, 'web')).toEqual({});
  });
});
