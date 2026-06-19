import { describe, expect, it } from 'vitest';
import { branchNameClassName, remoteUrlClassName } from '../../src/components/sidebar/overflow';

describe('sidebar overflow classes', () => {
  it('wraps branch names instead of truncating them', () => {
    expect(branchNameClassName(false)).toContain('whitespace-normal');
    expect(branchNameClassName(false)).toContain('break-all');
    expect(branchNameClassName(false)).not.toContain('truncate');
  });

  it('keeps current-branch emphasis while allowing wrapping', () => {
    expect(branchNameClassName(true)).toContain('font-semibold');
    expect(branchNameClassName(true)).toContain('break-all');
  });

  it('wraps remote urls instead of clipping them', () => {
    expect(remoteUrlClassName()).toContain('whitespace-normal');
    expect(remoteUrlClassName()).toContain('break-all');
    expect(remoteUrlClassName()).not.toContain('truncate');
  });
});
