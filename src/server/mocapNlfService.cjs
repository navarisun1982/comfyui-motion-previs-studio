const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');

const OFFICIAL_NLF_DOWNLOAD_URL =
  'https://github.com/isarandi/nlf/releases/download/v0.3.2/nlf_l_multi_0.3.2.torchscript';
const EXPECTED_NLF_SIZE_BYTES = 493117974;
const EXPECTED_NLF_SIZE_MB = 470.3;

const PYTHON_CANDIDATES = [
  'D:\\conda_envs\\comfyui\\python.exe',
  'C:\\conda_envs\\comfyui\\python.exe',
  'python',
];

const MODEL_CANDIDATES = [
  'D:\\ComfyUI\\models\\nlf\\nlf_l_multi_0.3.2.torchscript',
  'D:\\ComfyUI\\models\\nlf\\nlf_l_multi_0.2.2.torchscript',
  'C:\\ComfyUI\\models\\nlf\\nlf_l_multi_0.3.2.torchscript',
  path.resolve(__dirname, '../../models/nlf/nlf_l_multi_0.3.2.torchscript'),
];

let activeDownloadState = {
  active: false,
  bytesDownloaded: 0,
  totalBytes: EXPECTED_NLF_SIZE_BYTES,
  percent: 0,
  targetPath: null,
  error: null,
  completedAt: null,
};

function resolvePythonExecutable() {
  for (const candidate of PYTHON_CANDIDATES) {
    if (candidate === 'python') return candidate;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return 'python';
}

function resolveNlfModelPath(customModelDir) {
  if (customModelDir && typeof customModelDir === 'string' && customModelDir.trim()) {
    const customTrimmed = customModelDir.trim();
    const directCandidates = customTrimmed.endsWith('.torchscript')
      ? [customTrimmed]
      : [
          path.join(customTrimmed, 'nlf_l_multi_0.3.2.torchscript'),
          path.join(customTrimmed, 'nlf', 'nlf_l_multi_0.3.2.torchscript'),
          path.join(customTrimmed, 'models', 'nlf', 'nlf_l_multi_0.3.2.torchscript'),
        ];
    for (const c of directCandidates) {
      try {
        if (fs.existsSync(c)) return c;
      } catch {
        // ignore
      }
    }
  }

  for (const candidate of MODEL_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function resolveTargetInstallPath(customModelDir) {
  if (customModelDir && typeof customModelDir === 'string' && customModelDir.trim()) {
    const trimmed = customModelDir.trim();
    if (trimmed.endsWith('.torchscript')) return trimmed;
    return path.join(trimmed, 'nlf_l_multi_0.3.2.torchscript');
  }
  if (fs.existsSync('D:\\ComfyUI\\models')) {
    return 'D:\\ComfyUI\\models\\nlf\\nlf_l_multi_0.3.2.torchscript';
  }
  if (fs.existsSync('C:\\ComfyUI\\models')) {
    return 'C:\\ComfyUI\\models\\nlf\\nlf_l_multi_0.3.2.torchscript';
  }
  return path.resolve(__dirname, '../../models/nlf/nlf_l_multi_0.3.2.torchscript');
}

function getBundledModelsStatus() {
  const repoRoot = path.resolve(__dirname, '../..');
  const items = [
    {
      id: 'mixamo-ybot-fbx',
      name: 'Mixamo Y-Bot Male Rig (y-bot-tpose.fbx)',
      relPath: 'public/models/y-bot-tpose.fbx',
      role: 'Canonical Male 3D Humanoid Skeleton & Mesh',
    },
    {
      id: 'mixamo-xbot-fbx',
      name: 'Mixamo X-Bot Female Rig (x-bot-tpose.fbx)',
      relPath: 'public/models/x-bot-tpose.fbx',
      role: 'Canonical Female 3D Humanoid Skeleton & Mesh',
    },
    {
      id: 'mixamo-xbot-glb',
      name: 'Mixamo Studio Locomotion Rig (Xbot.glb)',
      relPath: 'public/models/Xbot.glb',
      role: 'Studio Motion Capture Clips (Walk, Run, Idle, Agree, HeadShake)',
    },
    {
      id: 'mixamo-soldier-glb',
      name: 'Mixamo Vanguard Soldier (Soldier.glb)',
      relPath: 'public/models/Soldier.glb',
      role: 'Textured Tactical Soldier Rig & Locomotion',
    },
    {
      id: 'mixamo-michelle-glb',
      name: 'Mixamo Stylized Female Character (Michelle.glb)',
      relPath: 'public/models/Michelle.glb',
      role: 'Textured Female Character Rig',
    },
    {
      id: 'mediapipe-pose-lite',
      name: 'MediaPipe Pose Landmarker Lite (.task)',
      relPath: 'public/mediapipe/pose_landmarker_lite.task',
      role: 'Browser Fallback 2D/3D Pose Landmarker',
    },
  ];
  return items.map((item) => {
    const absPath = path.join(repoRoot, item.relPath);
    let exists = false;
    let sizeBytes = 0;
    try {
      if (fs.existsSync(absPath)) {
        exists = true;
        sizeBytes = fs.statSync(absPath).size;
      }
    } catch {
      // ignore
    }
    return {
      ...item,
      installed: exists,
      sizeBytes,
      sizeMb: Number((sizeBytes / (1024 * 1024)).toFixed(2)),
    };
  });
}

function getMocapNlfStatus(customModelDir) {
  const pythonExe = resolvePythonExecutable();
  const modelPath = resolveNlfModelPath(customModelDir);
  const targetInstallPath = modelPath || resolveTargetInstallPath(customModelDir);
  const scriptPath = path.resolve(__dirname, '../../scripts/mocap_nlf_extractor.py');
  const scriptExists = fs.existsSync(scriptPath);

  let modelSizeBytes = 0;
  if (modelPath) {
    try {
      modelSizeBytes = fs.statSync(modelPath).size;
    } catch {
      modelSizeBytes = 0;
    }
  }

  return {
    ok: Boolean(modelPath && scriptExists),
    available: Boolean(modelPath && scriptExists),
    engine: 'nlf-l-multi-0.3.2-smpl24',
    pythonExe,
    pythonFound: pythonExe !== 'python' || true,
    modelPath,
    targetInstallPath,
    modelSizeBytes,
    modelSizeMb: Number((modelSizeBytes / (1024 * 1024)).toFixed(1)),
    expectedSizeMb: EXPECTED_NLF_SIZE_MB,
    downloadUrl: OFFICIAL_NLF_DOWNLOAD_URL,
    scriptExists,
    bundledModels: getBundledModelsStatus(),
    downloadProgress: { ...activeDownloadState },
  };
}

function downloadFileWithRedirects(url, destFile, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 8) {
        reject(new Error('Too many HTTP redirects while downloading NLF model.'));
        return;
      }
      const client = currentUrl.startsWith('https:') ? https : http;
      const req = client.get(
        currentUrl,
        {
          headers: {
            'User-Agent': 'ComfyUI-Motion-Previs-Studio/1.0',
          },
        },
        (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            const nextUrl = new URL(res.headers.location, currentUrl).toString();
            follow(nextUrl, redirectCount + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} when downloading NLF model.`));
            return;
          }

          const totalBytes =
            parseInt(res.headers['content-length'] || '', 10) || EXPECTED_NLF_SIZE_BYTES;
          let bytesDownloaded = 0;

          const dir = path.dirname(destFile);
          fs.mkdirSync(dir, { recursive: true });
          const tempFile = `${destFile}.part`;
          const fileStream = fs.createWriteStream(tempFile);

          res.on('data', (chunk) => {
            bytesDownloaded += chunk.length;
            if (onProgress) {
              onProgress(bytesDownloaded, totalBytes);
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              try {
                if (bytesDownloaded < 100 * 1024 * 1024) {
                  try {
                    fs.unlinkSync(tempFile);
                  } catch {
                    // ignore
                  }
                  reject(
                    new Error(
                      `Downloaded file is unexpectedly small (${(
                        bytesDownloaded /
                        (1024 * 1024)
                      ).toFixed(1)} MB).`
                    )
                  );
                  return;
                }
                if (!fs.existsSync(destFile)) {
                  fs.renameSync(tempFile, destFile);
                } else {
                  try {
                    fs.unlinkSync(tempFile);
                  } catch {
                    // ignore
                  }
                }
                resolve({ destFile, bytesDownloaded });
              } catch (renameErr) {
                reject(renameErr);
              }
            });
          });

          fileStream.on('error', (err) => {
            try {
              fs.unlinkSync(tempFile);
            } catch {
              // ignore
            }
            reject(err);
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });
    };

    follow(url, 0);
  });
}

function startNlfModelDownload(options = {}) {
  const existingPath = resolveNlfModelPath(options.customModelDir);
  if (existingPath && fs.existsSync(existingPath)) {
    const sizeBytes = fs.statSync(existingPath).size;
    activeDownloadState = {
      active: false,
      bytesDownloaded: sizeBytes,
      totalBytes: sizeBytes,
      percent: 100,
      targetPath: existingPath,
      error: null,
      completedAt: Date.now(),
    };
    return {
      ok: true,
      alreadyInstalled: true,
      modelPath: existingPath,
      status: getMocapNlfStatus(options.customModelDir),
    };
  }

  if (activeDownloadState.active) {
    return {
      ok: true,
      alreadyDownloading: true,
      status: getMocapNlfStatus(options.customModelDir),
    };
  }

  const targetPath = resolveTargetInstallPath(options.customModelDir);
  activeDownloadState = {
    active: true,
    bytesDownloaded: 0,
    totalBytes: EXPECTED_NLF_SIZE_BYTES,
    percent: 0,
    targetPath,
    error: null,
    completedAt: null,
  };

  downloadFileWithRedirects(
    options.downloadUrl || OFFICIAL_NLF_DOWNLOAD_URL,
    targetPath,
    (bytesDownloaded, totalBytes) => {
      const pct = Math.min(99, Math.round((bytesDownloaded / Math.max(1, totalBytes)) * 100));
      activeDownloadState = {
        ...activeDownloadState,
        active: true,
        bytesDownloaded,
        totalBytes,
        percent: pct,
      };
    }
  )
    .then(({ bytesDownloaded }) => {
      activeDownloadState = {
        active: false,
        bytesDownloaded,
        totalBytes: bytesDownloaded,
        percent: 100,
        targetPath,
        error: null,
        completedAt: Date.now(),
      };
    })
    .catch((err) => {
      activeDownloadState = {
        ...activeDownloadState,
        active: false,
        error: err.message || 'Download failed.',
      };
    });

  return {
    ok: true,
    started: true,
    targetPath,
    status: getMocapNlfStatus(options.customModelDir),
  };
}

function extractNlfSmpl3dFromFrames(payload = {}) {
  return new Promise((resolve) => {
    const status = getMocapNlfStatus(payload.customModelDir);
    if (!status.available) {
      resolve({
        ok: false,
        error: 'Local NLF 3D SMPL TorchScript model or extractor script is not available.',
        status,
      });
      return;
    }

    const scriptPath = path.resolve(__dirname, '../../scripts/mocap_nlf_extractor.py');
    const tmpPrefix = path.join(
      os.tmpdir(),
      `comfy_nlf_mocap_${Date.now()}_${Math.random().toString(16).slice(2)}`
    );
    const inputJsonPath = `${tmpPrefix}_in.json`;
    const outputJsonPath = `${tmpPrefix}_out.json`;
    let tmpVideoPath = null;

    const cleanupTempFiles = () => {
      for (const p of [inputJsonPath, outputJsonPath, tmpVideoPath]) {
        if (!p) continue;
        try {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    };

    try {
      const nextPayload = { ...payload };
      if (typeof nextPayload.videoBase64 === 'string' && nextPayload.videoBase64.length > 16) {
        const rawB64 = nextPayload.videoBase64.includes(',')
          ? nextPayload.videoBase64.split(',', 2)[1]
          : nextPayload.videoBase64;
        const extMatch =
          typeof nextPayload.fileName === 'string' &&
          /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(nextPayload.fileName)
            ? nextPayload.fileName.match(/\.(mp4|webm|mov|mkv|avi|m4v)$/i)[0].toLowerCase()
            : '.mp4';
        tmpVideoPath = `${tmpPrefix}_video${extMatch}`;
        fs.writeFileSync(tmpVideoPath, Buffer.from(rawB64, 'base64'));
        nextPayload.videoPath = tmpVideoPath;
        delete nextPayload.videoBase64;
      }

      fs.writeFileSync(
        inputJsonPath,
        JSON.stringify({
          ...nextPayload,
          modelPath: nextPayload.modelPath || status.modelPath,
        }),
        'utf-8'
      );
    } catch (writeErr) {
      cleanupTempFiles();
      resolve({
        ok: false,
        error: `Failed to write NLF input payload: ${writeErr.message}`,
      });
      return;
    }

    execFile(
      status.pythonExe,
      [scriptPath, '--input-json', inputJsonPath, '--output-json', outputJsonPath],
      {
        timeout: 240000,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        try {
          if (fs.existsSync(outputJsonPath)) {
            const rawOut = fs.readFileSync(outputJsonPath, 'utf-8');
            const parsed = JSON.parse(rawOut);
            cleanupTempFiles();
            resolve(parsed);
            return;
          }
          if (stdout && stdout.trim().startsWith('{')) {
            const parsed = JSON.parse(stdout.trim());
            cleanupTempFiles();
            resolve(parsed);
            return;
          }
          cleanupTempFiles();
          resolve({
            ok: false,
            error: err
              ? `NLF 3D extractor failed: ${err.message}${stderr ? ` | ${stderr.slice(0, 300)}` : ''}`
              : 'NLF 3D extractor produced no output JSON.',
          });
        } catch (parseErr) {
          cleanupTempFiles();
          resolve({
            ok: false,
            error: `Failed to parse NLF 3D output JSON: ${parseErr.message}`,
          });
        }
      }
    );
  });
}

function handleMocapNlfRequest(req, res) {
  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

  if (pathname.endsWith('/status') && req.method === 'GET') {
    const urlObj = new URL(rawUrl, 'http://localhost');
    const customDir = urlObj.searchParams.get('customModelDir') || undefined;
    const status = getMocapNlfStatus(customDir);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(status));
    return true;
  }

  if (pathname.endsWith('/download') && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let payload = {};
      try {
        const rawStr = Buffer.concat(chunks).toString('utf-8');
        payload = rawStr ? JSON.parse(rawStr) : {};
      } catch {
        payload = {};
      }
      const result = startNlfModelDownload(payload);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
    });
    return true;
  }

  if (pathname.endsWith('/extract') && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let payload = {};
      try {
        const rawStr = Buffer.concat(chunks).toString('utf-8');
        payload = rawStr ? JSON.parse(rawStr) : {};
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: `Invalid JSON body: ${err.message}` }));
        return;
      }

      extractNlfSmpl3dFromFrames(payload)
        .then((result) => {
          res.writeHead(result && result.ok ? 200 : 500, {
            'Content-Type': 'application/json; charset=utf-8',
          });
          res.end(JSON.stringify(result));
        })
        .catch((err) => {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: err.message || 'NLF extraction error' }));
        });
    });
    return true;
  }

  return false;
}

module.exports = {
  getMocapNlfStatus,
  startNlfModelDownload,
  extractNlfSmpl3dFromFrames,
  handleMocapNlfRequest,
};
