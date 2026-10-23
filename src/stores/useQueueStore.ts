import { create } from 'zustand';
import { defaultGenerationQueue, QueueItem, EnqueueBatchParams } from '../pipeline/generationQueue';

interface QueueState {
  items: QueueItem[];
  activeItem: QueueItem | null;
  enqueueBatch: (params: EnqueueBatchParams) => QueueItem[];
  cancelItem: (id: string) => Promise<void>;
  retryItem: (id: string) => void;
  clearQueue: () => Promise<void>;
  clearCompleted: () => void;
}

export const useQueueStore = create<QueueState>((_set, _get) => {
  // Initialize from defaultGenerationQueue
  const initialItems = defaultGenerationQueue.getItems();
  const initialActive = defaultGenerationQueue.getActiveItem();

  return {
    items: initialItems,
    activeItem: initialActive,

    enqueueBatch: (params) => {
      return defaultGenerationQueue.enqueueBatch(params);
    },

    cancelItem: async (id) => {
      await defaultGenerationQueue.cancelItem(id);
    },

    retryItem: (id) => {
      defaultGenerationQueue.retryItem(id);
    },

    clearQueue: async () => {
      await defaultGenerationQueue.clearQueue();
    },

    clearCompleted: () => {
      defaultGenerationQueue.clearCompleted();
    },
  };
});

// Sync defaultGenerationQueue updates directly into the Zustand store
defaultGenerationQueue.subscribe((items, activeItem) => {
  useQueueStore.setState({ items, activeItem });
});
