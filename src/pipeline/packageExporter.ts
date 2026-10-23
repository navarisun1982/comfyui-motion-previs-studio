import { ApiWorkflow, EngineId, GenerationMode, QualityProfile } from './templateTypes';
import { ShotSpec } from '../types/shotspec';
import { templateRegistry } from './templateRegistry';
import { bindTemplate, BindValues } from './templateBinder';
import { compilePromptForShot } from '../engine/promptCompiler';

export interface PackageManifest {
  studio: string;
  version: string;
  exportedAt: string;
  shotId: string;
  shotName: string;
  engine: EngineId;
  templateId: string;
  templateHash: string;
  mode: GenerationMode;
  profile: QualityProfile;
  seed: number;
  prompt: string;
  negative: string;
  promptSource: 'compiled' | 'ai' | 'manual';
  requiredUploads: Array<{
    filename: string;
    sha256?: string;
    type: string;
  }>;
}

export function buildPackageManifest(params: {
  shotId: string;
  shotName: string;
  engine: EngineId;
  templateId: string;
  templateHash: string;
  mode: GenerationMode;
  profile: QualityProfile;
  seed: number;
  prompt: string;
  negative: string;
  promptSource: 'compiled' | 'ai' | 'manual';
  firstFrameFilename?: string;
}): PackageManifest {
  return {
    studio: 'ComfyUI Motion Previs Studio',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    shotId: params.shotId,
    shotName: params.shotName,
    engine: params.engine,
    templateId: params.templateId,
    templateHash: params.templateHash,
    mode: params.mode,
    profile: params.profile,
    seed: params.seed,
    prompt: params.prompt,
    negative: params.negative,
    promptSource: params.promptSource,
    requiredUploads: params.firstFrameFilename
      ? [{ filename: params.firstFrameFilename, type: 'firstFrame' }]
      : [],
  };
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPackageBundle(
  workflow: ApiWorkflow,
  manifest: PackageManifest,
  baseFilename: string
): void {
  downloadJsonFile(`${baseFilename}.api.json`, workflow);
  downloadJsonFile(`${baseFilename}.manifest.json`, manifest);
}

export function exportOfflinePackageForShot(params: {
  shot: ShotSpec;
  profile: QualityProfile;
}): { success: boolean; error?: string } {
  const { shot, profile } = params;
  const engine: EngineId = shot.targetModel === 'minimax-h3' ? 'minimax-h3' : 'ltx-2.5';
  const mode: GenerationMode = shot.referenceImage?.filename ? 'i2v' : 't2v';

  const reg = templateRegistry.find(engine, mode);
  const baseFilename = `package_${engine}_${shot.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_v${shot.version}`;
  const compiled = compilePromptForShot(shot);
  const promptText = compiled.positivePrompt;

  if (reg) {
    const bindValues: BindValues = {
      mode,
      profile,
      prompt: promptText,
      negative: shot.negativePrompt || '',
      seed: shot.seed ?? Math.floor(Math.random() * 1000000),
      durationSeconds: shot.durationSeconds,
      frameRate: shot.frameRate,
      aspectRatio: shot.aspectRatio,
      width: shot.aspectRatio === '9:16' ? 720 : 1280,
      height: shot.aspectRatio === '9:16' ? 1280 : 720,
      firstFrameFile: shot.referenceImage?.filename,
      filenamePrefix: baseFilename,
    };
    const bound = bindTemplate(reg.api, reg.binding, bindValues);
    const manifest = buildPackageManifest({
      shotId: shot.id,
      shotName: shot.name,
      engine,
      templateId: reg.binding.templateId,
      templateHash: reg.templateHash,
      mode,
      profile,
      seed: bindValues.seed,
      prompt: bindValues.prompt,
      negative: bindValues.negative,
      promptSource: 'compiled',
      firstFrameFilename: shot.referenceImage?.filename,
    });
    exportPackageBundle(bound.workflow, manifest, baseFilename);
    return { success: true };
  } else {
    // If no template is registered yet (or Seedance prompt-export)
    const manifest = buildPackageManifest({
      shotId: shot.id,
      shotName: shot.name,
      engine,
      templateId: 'unregistered',
      templateHash: '',
      mode,
      profile,
      seed: shot.seed ?? 42,
      prompt: promptText,
      negative: shot.negativePrompt || '',
      promptSource: 'compiled',
      firstFrameFilename: shot.referenceImage?.filename,
    });
    downloadJsonFile(`${baseFilename}.manifest.json`, manifest);
    return { success: true };
  }
}
