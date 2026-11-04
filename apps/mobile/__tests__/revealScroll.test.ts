import { revealScrollY } from '@/features/auth/revealScroll';

describe('QA email card: revealScrollY', () => {
  const base = { anchorTop: 200, scrollY: 0, viewportH: 300 };

  it('scrolls just far enough to show the whole box when it fits', () => {
    // Box 400 to 550: bottom at 550 needs a scroll of 250; the anchor allows 200.
    expect(revealScrollY({ ...base, boxBottom: 450 })).toBe(150);
  });

  it('never scrolls the anchor (the focused field) above the top', () => {
    expect(revealScrollY({ ...base, boxBottom: 900 })).toBe(200);
  });

  it('does nothing when the box is already in view', () => {
    expect(revealScrollY({ ...base, boxBottom: 280 })).toBeNull();
  });

  it('never scrolls back up', () => {
    expect(revealScrollY({ ...base, scrollY: 220, boxBottom: 900 })).toBeNull();
  });

  it('does nothing before the viewport is measured', () => {
    expect(revealScrollY({ ...base, viewportH: 0, boxBottom: 900 })).toBeNull();
  });
});
