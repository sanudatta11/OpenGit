import { describe, expect, it } from 'vitest';
import { authorVisual } from '../../src/graph/authorVisual';

describe('authorVisual', () => {
  it('derives initials from author name', () => {
    expect(authorVisual('Jimmy Lai', 'jimmy@example.com').initials).toBe('JL');
  });

  it('falls back to email when name is missing', () => {
    expect(authorVisual('', 'tim@example.com').initials).toBe('TI');
  });

  it('is stable for the same author identity', () => {
    const first = authorVisual('Janka Uryga', 'janka@example.com');
    const second = authorVisual('Janka Uryga', 'janka@example.com');
    expect(first).toEqual(second);
  });
});
