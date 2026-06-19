import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphFilterStore } from '../../src/stores/graphFilter';

describe('graphFilter store', () => {
  beforeEach(() => {
    useGraphFilterStore.getState().clearAll();
  });

  it('deduplicates muted refs', () => {
    const store = useGraphFilterStore.getState();

    store.mute('feature/login');
    store.mute('feature/login');

    expect(useGraphFilterStore.getState().mutedRefs).toEqual(['feature/login']);
  });
});
