import { LTXVideoAdapter } from './src/adapters/ltxAdapter';
import { MockModelAdapter } from './src/adapters/mockAdapter';
import { createDefaultShotSpec } from './src/types/shotspec';
import * as fs from 'fs';
import * as path from 'path';

const outDir = path.resolve(process.cwd(), 'workflows');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const ltxAdapter = new LTXVideoAdapter();
const mockAdapter = new MockModelAdapter();

// 1. Text-to-Video LTX-2.5
const shotT2V = createDefaultShotSpec({
  name: 'Cyberpunk Alley Dolly Push',
  durationSeconds: 4.0,
  frameRate: 24,
  aspectRatio: '16:9',
  camera: {
    lens: { focalLength: '35mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
    shotType: 'medium',
    angle: 'eye-level',
    movement: {
      type: 'dolly-in',
      speed: 'slow-cinematic',
      startPosition: { x: 50, y: 85, z: 20 },
      endPosition: { x: 50, y: 65, z: 20 },
      targetLookAt: { x: 50, y: 50 },
    },
  },
  sceneDescription: 'cinematic neon cyberpunk alley in gentle rain, wet asphalt reflections, moody atmospheric steam',
});

const t2vWorkflow = ltxAdapter.buildWorkflow(shotT2V);
fs.writeFileSync(
  path.join(outDir, 'ltx_2.5_director_text_to_video.json'),
  JSON.stringify(t2vWorkflow, null, 2),
  'utf-8'
);

// 2. Image-to-Video LTX-2.5
const shotI2V = createDefaultShotSpec({
  name: 'Hero Reveal Crane Up',
  durationSeconds: 4.0,
  frameRate: 24,
  aspectRatio: '16:9',
  camera: {
    lens: { focalLength: '24mm', sensorSize: 'full-frame', aperture: 'f/2.8' },
    shotType: 'wide',
    angle: 'low-angle',
    movement: {
      type: 'pedestal-up',
      speed: 'slow-cinematic',
      startPosition: { x: 50, y: 80, z: 10 },
      endPosition: { x: 50, y: 80, z: 40 },
      targetLookAt: { x: 50, y: 50 },
    },
  },
  sceneDescription: 'cinematic desert landscape at dusk, lone operative looking over ancient monument',
});

const i2vWorkflow = ltxAdapter.buildWorkflow(shotI2V, 'example_start_frame.png');
fs.writeFileSync(
  path.join(outDir, 'ltx_2.5_director_image_to_video.json'),
  JSON.stringify(i2vWorkflow, null, 2),
  'utf-8'
);

// 3. Mock Workflow
const mockWf = mockAdapter.buildWorkflow(shotT2V);
fs.writeFileSync(
  path.join(outDir, 'mock_director_test_workflow.json'),
  JSON.stringify(mockWf, null, 2),
  'utf-8'
);

console.log('Successfully generated ComfyUI workflow files in workflows/');
