import { CinematicSequence } from '../types/sequenceTypes';
import { secondsToTimecode, getEffectiveShotDuration } from './timecodeMath';

interface ExportOptions {
  projectName?: string;
  reelName?: string;
}

/**
 * Generates an authentic, conformant OpenTimelineIO (.otio) JSON interchange file.
 * Compatible with Pixar USD, DaVinci Resolve, Autodesk RV, and modern VFX editorial pipelines.
 */
export function exportToOpenTimelineIO(
  sequence: CinematicSequence,
  options: ExportOptions = {}
): string {
  const fps = sequence.fps || 24;
  const projectName = options.projectName || 'ComfyUI_Motion_Previs_Studio';

  let accumulatedFrames = 0;

  const clips = sequence.shots.map((shot) => {
    const durationSec = getEffectiveShotDuration(shot);
    const durationFrames = Math.round(durationSec * fps);
    const trimInFrames = Math.round((shot.trimInSeconds || 0) * fps);

    const mediaTarget = shot.heroTakeVideoUrl || shot.previsVideoUrl || `media/${shot.shotCode.replace(/\s+/g, '_')}.mp4`;

    const clipObj = {
      OTIO_SCHEMA: 'Clip.1',
      name: `${shot.shotCode} - ${shot.title}`,
      source_range: {
        OTIO_SCHEMA: 'TimeRange.1',
        start_time: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: trimInFrames,
          rate: fps,
        },
        duration: {
          OTIO_SCHEMA: 'RationalTime.1',
          value: durationFrames,
          rate: fps,
        },
      },
      media_reference: {
        OTIO_SCHEMA: 'ExternalReference.1',
        target_url: mediaTarget,
        available_range: {
          OTIO_SCHEMA: 'TimeRange.1',
          start_time: {
            OTIO_SCHEMA: 'RationalTime.1',
            value: 0,
            rate: fps,
          },
          duration: {
            OTIO_SCHEMA: 'RationalTime.1',
            value: Math.round(shot.durationSeconds * fps),
            rate: fps,
          },
        },
      },
      metadata: {
        comfyui_previs: {
          shotId: shot.shotId,
          shotCode: shot.shotCode,
          cameraMovement: shot.shotSpecSnapshot?.camera.movement.type,
          focalLength: shot.shotSpecSnapshot?.camera.lens.focalLength,
          lighting: shot.shotSpecSnapshot?.lighting.style,
          heroTakeId: shot.heroTakeId,
          heroTakeNumber: shot.heroTakeNumber,
          fidelityScore: shot.heroFidelityScore,
        },
      },
    };

    accumulatedFrames += durationFrames;
    return clipObj;
  });

  const otioDoc = {
    OTIO_SCHEMA: 'Timeline.1',
    name: `${sequence.sceneName || 'Sequence'} - Assembly`,
    global_start_time: {
      OTIO_SCHEMA: 'RationalTime.1',
      value: 0,
      rate: fps,
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'V1 - Hero Video Track',
          kind: 'Video',
          children: clips,
        },
      ],
    },
    metadata: {
      generator: 'ComfyUI Motion Previs Studio (Stage 10 Sequence Assembly)',
      project: projectName,
      sceneId: sequence.sceneId,
      sceneName: sequence.sceneName,
      fps,
      totalDurationSeconds: sequence.totalDurationSeconds,
      timestamp: new Date().toISOString(),
    },
  };

  return JSON.stringify(otioDoc, null, 2);
}

/**
 * Generates an industry-standard CMX 3600 Edit Decision List (.edl) text document.
 * Universal interchange format compatible with DaVinci Resolve, Premiere Pro, Avid, and Final Cut Pro.
 */
export function exportToCMX3600EDL(
  sequence: CinematicSequence,
  options: ExportOptions = {}
): string {
  const fps = sequence.fps || 24;
  const title = (sequence.sceneName || 'COMFYUI_SEQUENCE').toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const reel = (options.reelName || 'AX').padEnd(8, ' ').substring(0, 8);

  const lines: string[] = [];
  lines.push(`TITLE:   ${title}`);
  lines.push('FCM:     NON-DROP FRAME');
  lines.push('');

  let recordStartSec = 0;

  sequence.shots.forEach((shot, idx) => {
    const eventNum = String(idx + 1).padStart(3, '0');
    const effDurationSec = getEffectiveShotDuration(shot);
    const recordEndSec = recordStartSec + effDurationSec;

    const srcInSec = shot.trimInSeconds || 0;
    const srcOutSec = srcInSec + effDurationSec;

    const srcInTC = secondsToTimecode(srcInSec, fps);
    const srcOutTC = secondsToTimecode(srcOutSec, fps);
    const recInTC = secondsToTimecode(recordStartSec, fps);
    const recOutTC = secondsToTimecode(recordEndSec, fps);

    // Edit type: C for Cut, or D for Dissolve if transition specified
    const editType = shot.transitionAfter?.type === 'dissolve' ? 'D' : 'C';

    // Format: 001  AX       V     C        00:00:00:00 00:00:04:00 00:00:00:00 00:00:04:00
    lines.push(`${eventNum}  ${reel} V     ${editType}        ${srcInTC} ${srcOutTC} ${recInTC} ${recOutTC}`);

    // Comments for DaVinci Resolve & Premiere reel/clip reconnection
    const clipCleanName = `${shot.shotCode.replace(/\s+/g, '_')}_${shot.title.replace(/\s+/g, '_')}.mp4`;
    lines.push(`* FROM CLIP NAME: ${clipCleanName}`);

    if (shot.heroTakeNumber) {
      lines.push(`* COMFYUI_HERO_TAKE: Take ${shot.heroTakeNumber}${shot.heroFidelityScore ? ` (${shot.heroFidelityScore}% Fidelity)` : ''}`);
    } else {
      lines.push('* COMFYUI_HERO_TAKE: 3D Previs Pass');
    }

    if (shot.shotSpecSnapshot?.camera.movement.type) {
      lines.push(`* CAMERA_MOTION: ${shot.shotSpecSnapshot.camera.movement.type} (${shot.shotSpecSnapshot.camera.movement.speed || 'moderate'})`);
    }

    lines.push('');
    recordStartSec = recordEndSec;
  });

  return lines.join('\n');
}

/**
 * Generates standard Final Cut Pro 7 / DaVinci Resolve XML (.fcpxml / .xml) timeline format.
 */
export function exportToFinalCutProXml(
  sequence: CinematicSequence,
  _options: ExportOptions = {}
): string {
  const fps = sequence.fps || 24;
  const seqName = sequence.sceneName || 'ComfyUI Sequence';
  const totalFrames = Math.round(sequence.totalDurationSeconds * fps);

  let accumulatedFrames = 0;

  const clipItemsXml = sequence.shots.map((shot, idx) => {
    const durationFrames = Math.round(getEffectiveShotDuration(shot) * fps);
    const startFrame = accumulatedFrames;
    const endFrame = startFrame + durationFrames;
    const inFrame = Math.round((shot.trimInSeconds || 0) * fps);
    const outFrame = inFrame + durationFrames;
    const clipName = `${shot.shotCode} - ${shot.title}`;
    const mediaFile = shot.heroTakeVideoUrl || shot.previsVideoUrl || `file://localhost/media/${shot.shotCode.replace(/\s+/g, '_')}.mp4`;

    accumulatedFrames = endFrame;

    return `
        <clipitem id="clipitem-${idx + 1}">
          <name>${clipName}</name>
          <duration>${durationFrames}</duration>
          <rate>
            <timebase>${fps}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <start>${startFrame}</start>
          <end>${endFrame}</end>
          <in>${inFrame}</in>
          <out>${outFrame}</out>
          <file id="file-${idx + 1}">
            <name>${clipName}.mp4</name>
            <pathurl>${mediaFile}</pathurl>
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <duration>${Math.round(shot.durationSeconds * fps)}</duration>
            <media>
              <video>
                <samplecharacteristics>
                  <width>1920</width>
                  <height>1080</height>
                </samplecharacteristics>
              </video>
            </media>
          </file>
          <logginginfo>
            <description>ComfyUI Shot: ${shot.shotCode} (${shot.title})</description>
            <scene>${sequence.sceneName}</scene>
            <shottake>${shot.heroTakeNumber ? `Take ${shot.heroTakeNumber}` : 'Previs'}</shottake>
            <lognote>Camera: ${shot.shotSpecSnapshot?.camera.movement.type || 'static'}</lognote>
          </logginginfo>
        </clipitem>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>${seqName}</name>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${fps}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <timecode>
      <rate>
        <timebase>${fps}</timebase>
        <ntsc>FALSE</ntsc>
      </rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <width>1920</width>
            <height>1080</height>
            <pixelaspectratio>square</pixelaspectratio>
            <rate>
              <timebase>${fps}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
          </samplecharacteristics>
        </format>
        <track>
${clipItemsXml}
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
        </track>
      </video>
    </media>
  </sequence>
</xmeml>
`;
}
