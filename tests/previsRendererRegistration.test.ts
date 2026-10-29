// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useShotStore, PrevisRendererFn } from '../src/stores/useShotStore';

describe('useShotStore - previs renderer registration & execution', () => {
  beforeEach(() => {
    // Reset any registered renderers
    useShotStore.getState().registerPrevisRenderer(null);
  });

  it('warns and returns null when no previs renderer is registered', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await useShotStore.getState().renderPrevisVideo('rgb', '720p');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('No active 3D Previs renderer registered');
    warnSpy.mockRestore();
  });

  it('registers and invokes active previs renderer with requested pass and resolution', async () => {
    const mockRenderer: PrevisRendererFn = vi.fn(async (_passMode, _resolution) => {
      return {
        url: 'blob:test-url',
        blob: new Blob(['fake-mp4'], { type: 'video/mp4' }),
      };
    });

    const unregister = useShotStore.getState().registerPrevisRenderer(mockRenderer, 'primary');
    expect(useShotStore.getState().previsRendererFn).toBe(mockRenderer);

    const result = await useShotStore.getState().renderPrevisVideo('all', '1080p');
    expect(result?.url).toBe('blob:test-url');
    expect(mockRenderer).toHaveBeenCalledWith('all', '1080p');

    // Clean up
    if (typeof unregister === 'function') unregister();
    expect(useShotStore.getState().previsRendererFn).toBeNull();
  });

  it('manages stacked priority between Viewfinder (primary) and Stage (fallback) renderers', async () => {
    const stageRenderer: PrevisRendererFn = vi.fn(async () => ({
      url: 'blob:stage',
      blob: new Blob(['stage']),
    }));
    const viewfinderRenderer: PrevisRendererFn = vi.fn(async () => ({
      url: 'blob:viewfinder',
      blob: new Blob(['viewfinder']),
    }));

    // 1. Stage instance mounts first
    const unregisterStage = useShotStore.getState().registerPrevisRenderer(stageRenderer, 'fallback');
    expect(useShotStore.getState().previsRendererFn).toBe(stageRenderer);

    // 2. Viewfinder instance mounts and takes primary priority
    const unregisterViewfinder = useShotStore.getState().registerPrevisRenderer(viewfinderRenderer, 'primary');
    expect(useShotStore.getState().previsRendererFn).toBe(viewfinderRenderer);

    // 3. Viewfinder unmounts -> Stage automatically resumes as active fallback
    if (typeof unregisterViewfinder === 'function') unregisterViewfinder();
    expect(useShotStore.getState().previsRendererFn).toBe(stageRenderer);

    // 4. Stage unmounts -> No renderer active
    if (typeof unregisterStage === 'function') unregisterStage();
    expect(useShotStore.getState().previsRendererFn).toBeNull();
  });
});
