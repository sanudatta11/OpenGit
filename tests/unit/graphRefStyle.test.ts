import { describe, expect, it } from 'vitest';
import { refBadgeStyle } from '../../src/components/graph/decorations/refStyles';

describe('refBadgeStyle', () => {
  it('uses readable foreground text for local badges', () => {
    expect(refBadgeStyle('local')).toContain('text-fg');
  });

  it('uses readable foreground text for remote badges', () => {
    expect(refBadgeStyle('remote')).toContain('text-fg');
  });

  it('uses readable foreground text for tag badges', () => {
    expect(refBadgeStyle('tag')).toContain('text-fg');
  });
});
