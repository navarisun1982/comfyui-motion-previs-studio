import { CameraMovementType, MovementSpeed, ShotSpec } from '../types/shotspec';
import { MotionFidelityAnalysis, MotionVectorGridPoint } from '../pipeline/revisionTypes';

export interface FrameFlowMetric {
  dx: number;
  dy: number;
  divergence: number;
  magnitude: number;
  gridPoints?: MotionVectorGridPoint[];
}

export interface ExpectedVector {
  expectedDx: number;
  expectedDy: number;
  expectedDivergence: number;
  minMagnitude: number;
  targetSpeedMagnitude: number;
}

/**
 * Returns expected optical flow signs and magnitude targets for a directed camera move
 * Note: Camera moves left -> scene background flows right (+dx).
 *       Camera moves up   -> scene background flows down (+dy).
 *       Camera moves in   -> scene expands outward (+divergence).
 */
export function getExpectedMotionVector(
  movementType: CameraMovementType,
  speed?: MovementSpeed
): ExpectedVector {
  let expectedDx = 0;
  let expectedDy = 0;
  let expectedDivergence = 0;

  switch (movementType) {
    case 'pan-left':
    case 'truck-left':
      expectedDx = 1.0;
      break;
    case 'pan-right':
    case 'truck-right':
      expectedDx = -1.0;
      break;
    case 'tilt-up':
    case 'pedestal-up':
      expectedDy = 1.0;
      break;
    case 'tilt-down':
    case 'pedestal-down':
      expectedDy = -1.0;
      break;
    case 'dolly-in':
    case 'zoom-in':
      expectedDivergence = 1.0;
      break;
    case 'dolly-out':
    case 'zoom-out':
      expectedDivergence = -1.0;
      break;
    case 'orbit-counter-clockwise':
      expectedDx = 0.85;
      break;
    case 'orbit-clockwise':
      expectedDx = -0.85;
      break;
    case 'whip-pan':
      expectedDx = 1.5;
      break;
    case 'handheld-subtle':
    case 'static':
    default:
      break;
  }

  let minMagnitude = 0.2;
  let targetSpeedMagnitude = 1.0;

  switch (speed) {
    case 'slow-cinematic':
      minMagnitude = 0.15;
      targetSpeedMagnitude = 0.6;
      break;
    case 'moderate':
      minMagnitude = 0.4;
      targetSpeedMagnitude = 1.2;
      break;
    case 'rapid-dynamic':
      minMagnitude = 0.8;
      targetSpeedMagnitude = 2.4;
      break;
  }

  return {
    expectedDx,
    expectedDy,
    expectedDivergence,
    minMagnitude,
    targetSpeedMagnitude,
  };
}

/**
 * Classifies dominant motion type from average flow vectors and divergence
 */
export function classifyDetectedMotion(
  avgDx: number,
  avgDy: number,
  divergence: number
): CameraMovementType {
  const mag = Math.sqrt(avgDx * avgDx + avgDy * avgDy);

  if (Math.abs(divergence) > 0.45 && Math.abs(divergence) > mag * 0.8) {
    return divergence > 0 ? 'dolly-in' : 'dolly-out';
  }

  if (mag < 0.25 && Math.abs(divergence) < 0.25) {
    return 'static';
  }

  if (Math.abs(avgDx) > Math.abs(avgDy) * 1.3) {
    return avgDx > 0 ? 'pan-left' : 'pan-right';
  }

  if (Math.abs(avgDy) > Math.abs(avgDx) * 1.3) {
    return avgDy > 0 ? 'tilt-up' : 'tilt-down';
  }

  // Diagonal / mixed
  return avgDx > 0 ? 'pan-left' : 'pan-right';
}

/**
 * Computes block-matching optical flow on grayscale frame buffers
 */
export function computeFrameFlow(
  prevGray: Float32Array,
  currGray: Float32Array,
  width: number,
  height: number,
  gridResolution = 6
): FrameFlowMetric {
  const patchSize = 8;
  const searchRadius = 6;

  // Inner margin to sample background motion and avoid border artifacts
  const marginX = Math.round(width * 0.1);
  const marginY = Math.round(height * 0.1);
  const activeW = width - marginX * 2;
  const activeH = height - marginY * 2;

  const gridPoints: MotionVectorGridPoint[] = [];
  let totalDx = 0;
  let totalDy = 0;
  let pointCount = 0;

  let leftDx = 0;
  let leftCount = 0;
  let rightDx = 0;
  let rightCount = 0;
  let topDy = 0;
  let topCount = 0;
  let bottomDy = 0;
  let bottomCount = 0;

  const midX = width / 2;
  const midY = height / 2;

  for (let gy = 0; gy < gridResolution; gy++) {
    const py = marginY + Math.round((gy / (gridResolution - 1)) * activeH);
    for (let gx = 0; gx < gridResolution; gx++) {
      const px = marginX + Math.round((gx / (gridResolution - 1)) * activeW);

      // Check contrast/variance of the patch in prevGray to filter flat regions
      let minVal = Infinity;
      let maxVal = -Infinity;
      let sadZero = 0;
      for (let dy = 0; dy < patchSize; dy += 2) {
        const row = (py + dy) * width;
        for (let dx = 0; dx < patchSize; dx += 2) {
          const val = prevGray[row + (px + dx)];
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
          sadZero += Math.abs(val - currGray[row + (px + dx)]);
        }
      }

      // If flat textureless patch (contrast < 4), default to stationary (0,0)
      if (maxVal - minVal < 4) {
        gridPoints.push({
          x: px / width,
          y: py / height,
          dx: 0,
          dy: 0,
          magnitude: 0,
        });
        pointCount++;
        continue;
      }

      let bestSAD = sadZero;
      let bestDx = 0;
      let bestDy = 0;

      for (let sdy = -searchRadius; sdy <= searchRadius; sdy += 2) {
        const targetY = py + sdy;
        if (targetY < 0 || targetY + patchSize >= height) continue;

        for (let sdx = -searchRadius; sdx <= searchRadius; sdx += 2) {
          if (sdx === 0 && sdy === 0) continue;
          const targetX = px + sdx;
          if (targetX < 0 || targetX + patchSize >= width) continue;

          let sad = 0;
          for (let dy = 0; dy < patchSize; dy += 2) {
            const rowPrev = (py + dy) * width;
            const rowCurr = (targetY + dy) * width;
            for (let dx = 0; dx < patchSize; dx += 2) {
              const diff = prevGray[rowPrev + (px + dx)] - currGray[rowCurr + (targetX + dx)];
              sad += Math.abs(diff);
            }
          }

          // Require meaningful improvement over zero displacement
          if (sad < bestSAD - 1.0) {
            bestSAD = sad;
            bestDx = sdx;
            bestDy = sdy;
          }
        }
      }

      const ptMag = Math.sqrt(bestDx * bestDx + bestDy * bestDy);

      gridPoints.push({
        x: px / width,
        y: py / height,
        dx: bestDx,
        dy: bestDy,
        magnitude: ptMag,
      });

      totalDx += bestDx;
      totalDy += bestDy;
      pointCount++;

      if (px < midX) {
        leftDx += bestDx;
        leftCount++;
      } else {
        rightDx += bestDx;
        rightCount++;
      }

      if (py < midY) {
        topDy += bestDy;
        topCount++;
      } else {
        bottomDy += bestDy;
        bottomCount++;
      }
    }
  }

  const avgDx = pointCount > 0 ? totalDx / pointCount : 0;
  const avgDy = pointCount > 0 ? totalDy / pointCount : 0;
  const avgLeft = leftCount > 0 ? leftDx / leftCount : 0;
  const avgRight = rightCount > 0 ? rightDx / rightCount : 0;
  const avgTop = topCount > 0 ? topDy / topCount : 0;
  const avgBottom = bottomCount > 0 ? bottomDy / bottomCount : 0;

  // Divergence = outward expansion from center
  const divergence = (avgRight - avgLeft) + (avgBottom - avgTop);
  const magnitude = Math.sqrt(avgDx * avgDx + avgDy * avgDy);

  return {
    dx: avgDx,
    dy: avgDy,
    divergence,
    magnitude,
    gridPoints,
  };
}

/**
 * Calculates Motion Fidelity Analysis by comparing achieved flow metrics with directed 3D ShotSpec
 */
export function calculateMotionFidelity(
  frameFlows: FrameFlowMetric[],
  directedMovement: CameraMovementType,
  speed: MovementSpeed = 'moderate'
): MotionFidelityAnalysis {
  if (frameFlows.length === 0) {
    return {
      overallScore: 50,
      directionalScore: 50,
      speedScore: 50,
      stabilityScore: 50,
      detectedMovement: 'static',
      directedMovement,
      achievedVector: { avgDx: 0, avgDy: 0, divergence: 0, magnitude: 0 },
      expectedVector: { expectedDx: 0, expectedDy: 0, expectedDivergence: 0 },
      classification: 'fair',
      summary: 'Insufficient frame data to determine motion fidelity.',
      recommendations: ['Ensure the video contains at least 2 keyframes.'],
      analyzedAt: Date.now(),
    };
  }

  // 1. Average achieved optical flow metrics across all sampled frame transitions
  let sumDx = 0;
  let sumDy = 0;
  let sumDiv = 0;
  let sumMag = 0;

  for (const f of frameFlows) {
    sumDx += f.dx;
    sumDy += f.dy;
    sumDiv += f.divergence;
    sumMag += f.magnitude;
  }

  const avgDx = sumDx / frameFlows.length;
  const avgDy = sumDy / frameFlows.length;
  const avgDivergence = sumDiv / frameFlows.length;
  const avgMagnitude = sumMag / frameFlows.length;

  const detectedMovement = classifyDetectedMotion(avgDx, avgDy, avgDivergence);
  const expected = getExpectedMotionVector(directedMovement, speed);

  // 2. Directional Alignment Score (0..100)
  let directionalScore = 0;

  if (directedMovement === 'static') {
    // For static, any motion reduces score
    const motionExcess = Math.min(100, (avgMagnitude + Math.abs(avgDivergence)) * 30);
    directionalScore = Math.max(0, 100 - motionExcess);
  } else if (expected.expectedDivergence !== 0) {
    // Dolly / Zoom
    const expectedSign = expected.expectedDivergence > 0 ? 1 : -1;
    const achievedSign = avgDivergence > 0 ? 1 : avgDivergence < 0 ? -1 : 0;

    if (expectedSign === achievedSign) {
      const strengthFactor = Math.min(1.0, Math.abs(avgDivergence) / 0.5);
      directionalScore = Math.round(70 + strengthFactor * 30);
    } else {
      // Opposite divergence or zero
      directionalScore = Math.max(10, Math.round(35 - Math.abs(avgDivergence) * 20));
    }
  } else {
    // Translational Moves (Pan, Tilt, Pedestal, Truck, Orbit)
    const expectedLen = Math.sqrt(
      expected.expectedDx * expected.expectedDx + expected.expectedDy * expected.expectedDy
    );
    const achievedLen = Math.sqrt(avgDx * avgDx + avgDy * avgDy);

    if (expectedLen > 0 && achievedLen > 0.15) {
      // Dot product for cosine similarity
      const dot =
        (expected.expectedDx * avgDx + expected.expectedDy * avgDy) /
        (expectedLen * achievedLen);
      // Map [-1, 1] to [0, 100]
      directionalScore = Math.round(Math.max(0, Math.min(100, (dot + 1) * 50)));
    } else if (achievedLen <= 0.15) {
      // Directed movement occurred, but output is static
      directionalScore = 25;
    }
  }

  // 3. Speed / Magnitude Score (0..100)
  let speedScore = 100;
  if (directedMovement === 'static') {
    speedScore = Math.max(0, Math.min(100, Math.round(100 - avgMagnitude * 50)));
  } else {
    const ratio = avgMagnitude / Math.max(0.1, expected.targetSpeedMagnitude);
    if (ratio >= 0.5 && ratio <= 1.8) {
      speedScore = 95;
    } else if (ratio < 0.5) {
      speedScore = Math.max(20, Math.round(ratio * 150));
    } else {
      speedScore = Math.max(40, Math.round(100 - (ratio - 1.8) * 30));
    }
  }

  // 4. Stability Score (0..100)
  // Low variance in direction across frames = high stability
  let variance = 0;
  for (const f of frameFlows) {
    const diff = f.magnitude - avgMagnitude;
    variance += diff * diff;
  }
  variance /= frameFlows.length;
  const stabilityScore = Math.max(30, Math.min(100, Math.round(100 - Math.sqrt(variance) * 25)));

  // 5. Overall Weighted Fidelity Score
  const overallScore = Math.round(
    directionalScore * 0.55 + speedScore * 0.25 + stabilityScore * 0.2
  );

  // Classification
  let classification: MotionFidelityAnalysis['classification'] = 'drift';
  if (overallScore >= 85) classification = 'excellent';
  else if (overallScore >= 70) classification = 'good';
  else if (overallScore >= 50) classification = 'fair';

  // 6. Directorial Guidance & Recommendations
  const recommendations: string[] = [];
  let summary = '';

  if (overallScore >= 85) {
    summary = `High motion fidelity (${overallScore}%): Video camera move faithfully executed directed "${directedMovement}" with consistent ${speed} velocity.`;
    recommendations.push('Motion trajectories are locked to previs. Suitable for final cut.');
  } else if (overallScore >= 70) {
    summary = `Good motion alignment (${overallScore}%): Camera move generally followed directed "${directedMovement}", with minor directional variance.`;
    recommendations.push(
      'To tighten trajectory tracking, consider increasing IC-LoRA conditioning strength by +0.15x.'
    );
  } else if (overallScore >= 50) {
    summary = `Moderate motion drift (${overallScore}%): Detected motion (${detectedMovement}) only partially matched directed "${directedMovement}".`;
    if (directedMovement === 'static' && avgMagnitude > 0.4) {
      recommendations.push('Camera drift detected on static shot: add "static camera, tripod shot, stationary" to prompt.');
    } else {
      recommendations.push(
        `Ensure prompt emphasizes directed "${directedMovement}" and increase IC-LoRA strength to 1.25x.`
      );
    }
  } else {
    summary = `Severe motion drift (${overallScore}%): Video generated ${detectedMovement} motion instead of directed "${directedMovement}".`;
    recommendations.push(
      `Re-render 3D previs pass and verify that IC-LoRA conditioning is enabled in Section 2.`
    );
    recommendations.push(
      `Add explicit camera direction verbs to your prompt (e.g., "camera moves forward in a steady ${directedMovement}").`
    );
  }

  // Representative grid vectors from middle transition
  const midIndex = Math.floor(frameFlows.length / 2);
  const gridVectors = frameFlows[midIndex]?.gridPoints || [];

  return {
    overallScore,
    directionalScore,
    speedScore,
    stabilityScore,
    detectedMovement,
    directedMovement,
    achievedVector: {
      avgDx: Number(avgDx.toFixed(2)),
      avgDy: Number(avgDy.toFixed(2)),
      divergence: Number(avgDivergence.toFixed(2)),
      magnitude: Number(avgMagnitude.toFixed(2)),
    },
    expectedVector: {
      expectedDx: expected.expectedDx,
      expectedDy: expected.expectedDy,
      expectedDivergence: expected.expectedDivergence,
    },
    gridVectors,
    classification,
    summary,
    recommendations,
    analyzedAt: Date.now(),
  };
}

/**
 * Seeks a video element and waits for seeked event
 */
function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.05) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.max(0, Math.min(video.duration || time, time));
  });
}

/**
 * Direct client-side video element frame sampler & optical flow analyzer
 */
export async function analyzeVideoMotionFidelity(
  videoElement: HTMLVideoElement,
  shotSpec: ShotSpec,
  onProgress?: (percent: number) => void
): Promise<MotionFidelityAnalysis> {
  const duration = videoElement.duration || shotSpec.durationSeconds || 5.0;
  const analysisWidth = 320;
  const analysisHeight = Math.round(
    (videoElement.videoHeight || 720) / (videoElement.videoWidth || 1280) * analysisWidth
  );

  const canvas = document.createElement('canvas');
  canvas.width = analysisWidth;
  canvas.height = analysisHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for optical flow analysis');
  }

  const sampleCount = Math.min(10, Math.max(4, Math.round(duration * 2)));
  const times: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    times.push((i / (sampleCount - 1)) * Math.max(0.1, duration - 0.1));
  }

  let prevGray: Float32Array | null = null;
  const frameFlows: FrameFlowMetric[] = [];

  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    onProgress?.(Math.round((i / times.length) * 85));
    await seekVideo(videoElement, t);

    ctx.drawImage(videoElement, 0, 0, analysisWidth, analysisHeight);
    const frame = ctx.getImageData(0, 0, analysisWidth, analysisHeight);

    const gray = new Float32Array(analysisWidth * analysisHeight);
    for (let p = 0; p < gray.length; p++) {
      const idx = p * 4;
      gray[p] = 0.299 * frame.data[idx] + 0.587 * frame.data[idx + 1] + 0.114 * frame.data[idx + 2];
    }

    if (prevGray) {
      const flow = computeFrameFlow(prevGray, gray, analysisWidth, analysisHeight, 6);
      frameFlows.push(flow);
    }

    prevGray = gray;
  }

  onProgress?.(95);

  const directedMovement = shotSpec.camera?.movement?.type || 'static';
  const speed = shotSpec.camera?.movement?.speed || 'moderate';

  const result = calculateMotionFidelity(frameFlows, directedMovement, speed);
  onProgress?.(100);

  return result;
}
