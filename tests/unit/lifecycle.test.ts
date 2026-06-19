// tests/unit/lifecycle.test.ts — unit tests for repository lifecycle and conflict parsing.

import { describe, it, expect } from 'vitest';
import { inferCloneRepoName, buildCloneArgs } from '../../electron/main/git/lifecycle';
import { parseConflictContent } from '../../electron/main/ipc/operations';

describe('inferCloneRepoName', () => {
  it('handles standard https github urls', () => {
    expect(inferCloneRepoName('https://github.com/sanudatta11/OpenGit')).toBe('OpenGit');
    expect(inferCloneRepoName('https://github.com/sanudatta11/OpenGit.git')).toBe('OpenGit');
  });

  it('handles ssh github urls', () => {
    expect(inferCloneRepoName('git@github.com:sanudatta11/OpenGit.git')).toBe('OpenGit');
  });

  it('handles query parameters and trailing slashes', () => {
    expect(inferCloneRepoName('https://github.com/foo/bar.git?ref=main')).toBe('bar');
    expect(inferCloneRepoName('https://github.com/foo/bar/')).toBe('bar');
  });

  it('falls back to default', () => {
    expect(inferCloneRepoName('')).toBe('repository');
  });
});

describe('buildCloneArgs', () => {
  it('builds basic clone arguments', () => {
    const args = buildCloneArgs({
      url: 'https://github.com/foo/bar.git',
      destinationParent: '/tmp',
      recursiveSubmodules: false,
    });
    expect(args).toEqual(['clone', 'https://github.com/foo/bar.git', 'bar']);
  });

  it('includes submodules and depth when requested', () => {
    const args = buildCloneArgs({
      url: 'https://github.com/foo/bar.git',
      destinationParent: '/tmp',
      recursiveSubmodules: true,
      shallowDepth: 1,
    });
    expect(args).toEqual(['clone', '--recurse-submodules', '--no-local', '--depth', '1', 'https://github.com/foo/bar.git', 'bar']);
  });
});

describe('parseConflictContent', () => {
  it('parses files with no conflicts', () => {
    const content = 'hello\nworld';
    const blocks = parseConflictContent(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ type: 'normal', content: 'hello\nworld' });
  });

  it('parses files with single conflict', () => {
    const content = [
      'line 1',
      '<<<<<<< HEAD',
      'current changes',
      '=======',
      'incoming changes',
      '>>>>>>> feature/auth',
      'line 2',
    ].join('\n');

    const blocks = parseConflictContent(content);
    expect(blocks).toHaveLength(3);
    
    expect(blocks[0]).toEqual({ type: 'normal', content: 'line 1' });
    expect(blocks[1]).toEqual({
      type: 'conflict',
      current: 'current changes',
      incoming: 'incoming changes',
      ourLabel: 'HEAD',
      theirLabel: 'feature/auth',
      id: 'conflict-1',
    });
    expect(blocks[2]).toEqual({ type: 'normal', content: 'line 2' });
  });

  it('parses multiple conflicts', () => {
    const content = [
      '<<<<<<< HEAD',
      'current 1',
      '=======',
      'incoming 1',
      '>>>>>>> branch-a',
      'middle text',
      '<<<<<<< HEAD',
      'current 2',
      '=======',
      'incoming 2',
      '>>>>>>> branch-b',
    ].join('\n');

    const blocks = parseConflictContent(content);
    expect(blocks).toHaveLength(3);
    
    expect(blocks[0]).toEqual({
      type: 'conflict',
      current: 'current 1',
      incoming: 'incoming 1',
      ourLabel: 'HEAD',
      theirLabel: 'branch-a',
      id: 'conflict-1',
    });
    expect(blocks[1]).toEqual({ type: 'normal', content: 'middle text' });
    expect(blocks[2]).toEqual({
      type: 'conflict',
      current: 'current 2',
      incoming: 'incoming 2',
      ourLabel: 'HEAD',
      theirLabel: 'branch-b',
      id: 'conflict-2',
    });
  });
});
