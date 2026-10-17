import { ModelCapabilityAdapter } from './types';
import { LTXVideoAdapter } from './ltxAdapter';
import { MockModelAdapter } from './mockAdapter';

export const adapters: Record<string, ModelCapabilityAdapter> = {
  'ltx-2.5': new LTXVideoAdapter(),
  'mock-engine': new MockModelAdapter(),
};

export function getAdapter(modelId: string): ModelCapabilityAdapter {
  return adapters[modelId] || adapters['ltx-2.5'];
}

export function getAllAdapters(): ModelCapabilityAdapter[] {
  return Object.values(adapters);
}

export * from './types';
export * from './ltxAdapter';
export * from './mockAdapter';
