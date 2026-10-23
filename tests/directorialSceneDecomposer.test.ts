import { describe, it, expect } from 'vitest';
import { decomposeDirectorialScene } from '../src/engine/directorialSceneDecomposer';

describe('Universal Directorial Scene Decomposer', () => {
  it('fully decomposes the user hearthside fireplace prompt across all 4 layers', () => {
    const prompt =
      'A rustic stone fireplace crackles with warm embers, casting flickering orange light across textured brick walls and polished wood floors. Volumetric smoke rises gently into the dimly lit room, creating soft shadows that dance against the deep blue twilight visible through a distant window.';

    const result = decomposeDirectorialScene(prompt);

    // 1. Architecture & Surfaces
    expect(result.environment.wallSurface).toBe('brick');
    expect(result.environment.groundSurface).toBe('wood-parquet');
    expect(result.environment.timeOfDay).toBe('twilight');
    expect(result.environment.windowView).toBe('twilight');

    // 2. Practical Dynamic Lighting
    expect(result.lighting.style).toBe('golden-hour');
    expect(result.lighting.contrast).toBe('high-contrast');
    expect(result.practicalLights.length).toBeGreaterThanOrEqual(1);
    const fireLight = result.practicalLights.find((l) => l.type === 'fire');
    expect(fireLight).toBeDefined();
    expect(fireLight?.flicker).toBe(true);
    expect(fireLight?.colorHex).toBe(0xf97316);

    // 3. Atmospheric Particles
    expect(result.particles.smoke).toBe(true);
    expect(result.particles.embers).toBe(true);

    // 4. Props & Actors
    expect(result.extractedActors.some((a) => a.name.includes('Fireplace'))).toBe(true);

    // 5. Cinematic Camera
    expect(result.cameraSuggestion.movement.type).toBe('dolly-in');
  });

  it('decomposes a cyberpunk rain scene into wet asphalt, neon lights, and vending machine', () => {
    const prompt =
      'A neon-lit cyberpunk alleyway in the rain with wet asphalt, glowing holographic vending machine, and steam rising from manholes under flashing cyan and magenta lights.';

    const result = decomposeDirectorialScene(prompt);

    expect(result.environment.groundSurface).toBe('asphalt-wet');
    expect(result.environment.weather).toBe('rain');
    expect(result.environment.timeOfDay).toBe('neon-night');
    expect(result.lighting.style).toBe('neon-cyberpunk');
    expect(result.practicalLights.some((l) => l.type === 'neon')).toBe(true);
    expect(result.particles.rain).toBe(true);
    expect(result.extractedActors.some((a) => a.name.includes('Vending Machine'))).toBe(true);
  });

  it('decomposes an antique study with wood paneling, grandfather clock, and desk', () => {
    const prompt =
      'A quiet Victorian study with polished wood parquet, an ornate grandfather clock ticking in the corner with a brass pendulum, mahogany desk, and soft warm lamplight.';

    const result = decomposeDirectorialScene(prompt);

    expect(result.environment.groundSurface).toBe('wood-parquet');
    expect(result.environment.wallSurface).toBe('wood-panel');
    expect(result.extractedActors.some((a) => a.name.includes('Clock'))).toBe(true);
    expect(result.extractedActors.some((a) => a.name.includes('Desk'))).toBe(true);
    expect(result.practicalLights.some((l) => l.type === 'lamp')).toBe(true);
  });

  it('handles Arabic scene descriptions accurately', () => {
    const arabicPrompt = 'مدفأة حجرية مع جمر متوهج ونار برتقالية على جدران من الطوب وأرضية باركيه خشبية مع دخان متصاعد';

    const result = decomposeDirectorialScene(arabicPrompt);

    expect(result.environment.wallSurface).toBe('brick');
    expect(result.environment.groundSurface).toBe('wood-parquet');
    expect(result.practicalLights.some((l) => l.type === 'fire')).toBe(true);
    expect(result.particles.smoke).toBe(true);
    expect(result.extractedActors.some((a) => a.name.includes('Fireplace'))).toBe(true);
  });
});
