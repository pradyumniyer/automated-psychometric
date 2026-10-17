import { describe, expect, it } from 'vitest';
import { rowNumberBackgroundClass } from '../src/lib/liveGridStyles';

describe('sticky row number backgrounds', () => {
  it('uses opaque backgrounds for highlighted, excluded, and alternating rows', () => {
    const classes = [
      rowNumberBackgroundClass(true, false, 0),
      rowNumberBackgroundClass(false, true, 0),
      rowNumberBackgroundClass(false, false, 1),
      rowNumberBackgroundClass(false, false, 0),
    ];

    expect(classes).toEqual(['bg-accent-100', 'bg-warning-50', 'bg-secondary-50', 'bg-white']);
    expect(classes.every((className) => !className.includes('/'))).toBe(true);
  });
});
