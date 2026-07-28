export type UpdateTransitionMode = 'up-to-date' | 'fast-forward' | 'squash-equivalent' | 'blocked';

export type UpdateTransition = {
  mode: UpdateTransitionMode;
  reason: string;
  checkoutTarget: string | null;
};

export function classifyUpdateTransition(input: {
  localCommit: string;
  targetCommit: string;
  isAncestor: boolean;
  localTree: string | null;
  targetHistoryTrees: string[];
}): UpdateTransition {
  if (input.localCommit === input.targetCommit) {
    return {
      mode: 'up-to-date',
      reason: 'Den valgte branch kører allerede.',
      checkoutTarget: null,
    };
  }
  if (input.isAncestor) {
    return {
      mode: 'fast-forward',
      reason: 'Målversionen er en almindelig forward-only opdatering.',
      checkoutTarget: input.targetCommit,
    };
  }
  if (input.localTree && input.targetHistoryTrees.includes(input.localTree)) {
    return {
      mode: 'squash-equivalent',
      reason: 'Den kørende versions komplette tree findes i målbranchens historik efter et squash-merge.',
      checkoutTarget: input.targetCommit,
    };
  }
  return {
    mode: 'blocked',
    reason: 'Den valgte branch indeholder ikke den kørende version og er derfor en reel divergering.',
    checkoutTarget: null,
  };
}
