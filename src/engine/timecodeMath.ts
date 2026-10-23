import { SequenceShotItem } from '../types/sequenceTypes';

/**
 * Converts fractional seconds into standard SMPTE timecode (HH:MM:SS:FF).
 */
export function secondsToTimecode(seconds: number, fps: number = 24): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;
  
  const totalFrames = Math.floor(seconds * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(seconds);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number, width: number = 2) => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

/**
 * Parses standard SMPTE timecode (HH:MM:SS:FF) back to seconds.
 */
export function timecodeToSeconds(timecode: string, fps: number = 24): number {
  if (!timecode || typeof timecode !== 'string') return 0;
  const parts = timecode.split(':').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return 0;

  const [hours, mins, secs, frames] = parts;
  return hours * 3600 + mins * 60 + secs + frames / fps;
}

/**
 * Converts seconds to total frames.
 */
export function secondsToFrames(seconds: number, fps: number = 24): number {
  if (isNaN(seconds) || seconds < 0) return 0;
  return Math.round(seconds * fps);
}

/**
 * Converts total frames to standard SMPTE timecode string.
 */
export function framesToTimecode(totalFrames: number, fps: number = 24): string {
  if (isNaN(totalFrames) || totalFrames < 0) totalFrames = 0;
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

export interface ShotTimelineRange {
  shotId: string;
  shotCode: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  startFrame: number;
  endFrame: number;
}

/**
 * Calculates effective playback duration for a single shot accounting for trim in/out.
 */
export function getEffectiveShotDuration(shot: SequenceShotItem): number {
  const trimIn = Math.max(0, shot.trimInSeconds || 0);
  const rawDuration = shot.durationSeconds || 4.0;
  const trimOut = shot.trimOutSeconds !== undefined && shot.trimOutSeconds > trimIn
    ? Math.min(rawDuration, shot.trimOutSeconds)
    : rawDuration;

  return Math.max(0.2, trimOut - trimIn);
}

/**
 * Computes global timeline start/end positions for every shot in a sequence.
 */
export function calculateShotTimeRanges(
  shots: SequenceShotItem[],
  fps: number = 24
): ShotTimelineRange[] {
  let accumulatedTime = 0;
  const ranges: ShotTimelineRange[] = [];

  for (const shot of shots) {
    const duration = getEffectiveShotDuration(shot);
    const startTime = accumulatedTime;
    const endTime = startTime + duration;
    const startFrame = Math.round(startTime * fps);
    const endFrame = Math.round(endTime * fps);

    ranges.push({
      shotId: shot.shotId,
      shotCode: shot.shotCode,
      title: shot.title,
      startTime,
      endTime,
      duration,
      startFrame,
      endFrame,
    });

    accumulatedTime = endTime;
  }

  return ranges;
}

/**
 * Total sequence duration summing all effective shot lengths.
 */
export function calculateSequenceDuration(shots: SequenceShotItem[]): number {
  return shots.reduce((acc, shot) => acc + getEffectiveShotDuration(shot), 0);
}

/**
 * Locates which shot is currently playing at a given timeline second.
 */
export function findShotAtTime(
  shots: SequenceShotItem[],
  timeSeconds: number,
  fps: number = 24
): {
  shot: SequenceShotItem | null;
  shotIndex: number;
  localTimeSeconds: number;
  range: ShotTimelineRange | null;
} {
  const ranges = calculateShotTimeRanges(shots, fps);
  if (ranges.length === 0) {
    return { shot: null, shotIndex: -1, localTimeSeconds: 0, range: null };
  }

  const clampedTime = Math.max(0, Math.min(timeSeconds, ranges[ranges.length - 1].endTime));

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    // If inside this range or at the very end of the final shot
    if (clampedTime >= range.startTime && (clampedTime < range.endTime || i === ranges.length - 1)) {
      const shot = shots[i];
      const localTimeSeconds = (shot.trimInSeconds || 0) + (clampedTime - range.startTime);
      return {
        shot,
        shotIndex: i,
        localTimeSeconds,
        range,
      };
    }
  }

  return {
    shot: shots[0],
    shotIndex: 0,
    localTimeSeconds: shots[0].trimInSeconds || 0,
    range: ranges[0],
  };
}
