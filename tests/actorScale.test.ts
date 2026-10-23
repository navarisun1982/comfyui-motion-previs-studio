import { describe, it, expect } from 'vitest';
import { useShotStore } from '../src/stores/useShotStore';

describe('Actor Scale in useShotStore', () => {
  it('updates actor scale properly', () => {
    const store = useShotStore.getState();
    const firstActor = store.shot.actors[0];
    expect(firstActor).toBeDefined();

    store.updateActor(firstActor.id, { scale: 2.5 });
    const updatedStore = useShotStore.getState();
    const target = updatedStore.shot.actors.find(a => a.id === firstActor.id);
    expect(target?.scale).toBe(2.5);
  });
});
