import { describe, expect, it } from 'vitest';
import { classifyUpdateTransition } from '../src/system/update-transition';

const localCommit = '1'.repeat(40);
const targetCommit = '2'.repeat(40);
const localTree = 'a'.repeat(40);

describe('updater transition policy', () => {
  it('returns up-to-date for the same commit without a checkout target', () => {
    expect(classifyUpdateTransition({
      localCommit,
      targetCommit: localCommit,
      isAncestor: false,
      localTree: null,
      targetHistoryTrees: [],
    })).toEqual({
      mode: 'up-to-date',
      reason: 'Den valgte branch kører allerede.',
      checkoutTarget: null,
    });
  });

  it('prefers a regular fast-forward transition', () => {
    expect(classifyUpdateTransition({
      localCommit,
      targetCommit,
      isAncestor: true,
      localTree,
      targetHistoryTrees: [],
    })).toMatchObject({ mode: 'fast-forward', checkoutTarget: targetCommit });
  });

  it('accepts an exact tree produced by a squash merge', () => {
    expect(classifyUpdateTransition({
      localCommit,
      targetCommit,
      isAncestor: false,
      localTree,
      targetHistoryTrees: [localTree],
    })).toMatchObject({ mode: 'squash-equivalent', checkoutTarget: targetCommit });
  });

  it('accepts the tree when newer commits follow the squash merge', () => {
    expect(classifyUpdateTransition({
      localCommit,
      targetCommit,
      isAncestor: false,
      localTree,
      targetHistoryTrees: ['b'.repeat(40), 'c'.repeat(40), localTree, 'd'.repeat(40)],
    })).toMatchObject({ mode: 'squash-equivalent', checkoutTarget: targetCommit });
  });

  it('blocks a genuinely divergent branch', () => {
    expect(classifyUpdateTransition({
      localCommit,
      targetCommit,
      isAncestor: false,
      localTree,
      targetHistoryTrees: ['b'.repeat(40)],
    })).toMatchObject({ mode: 'blocked', checkoutTarget: null });
  });
});
