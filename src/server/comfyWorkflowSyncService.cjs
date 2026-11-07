const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const REPO_TEMPLATES_DIR = path.resolve(__dirname, '../../workflows/templates');

const DEFAULT_COMFY_WORKFLOW_DIRS = [
  'D:\\ComfyUI\\user\\default\\workflows',
  'C:\\ComfyUI\\user\\default\\workflows',
];

const BUNDLED_DEFAULT_WORKFLOW_FILES = [
  {
    id: 'ltx25_unlimited_sing_talk',
    engine: 'ltx-2.5',
    filename: 'LTX_25_Unlimited_Video_Length_Sing_Talk.json',
    subfolder: 'LTX',
    sourceUrl:
      'https://civitai.com/models/2422765/ltx-25-unlimited-video-length-sing-or-talk-alternating-shots?modelVersionId=3368860',
  },
  {
    id: 'ltx25_devdist_ollama_vsr',
    engine: 'ltx-2.5',
    filename: 'LTX_25_DevDist_I2V_T2V_Ollama_RTX_VSR.json',
    subfolder: 'LTX',
    sourceUrl:
      'https://civitai.com/models/2318870/ltx-25-devdist-image-to-video-and-text-to-video-with-ollamartx-vsr?modelVersionId=3231942',
  },
  {
    id: 'ltx25_stubelius',
    engine: 'ltx-2.5',
    filename: 'Stubelius_Ultimate_LTX.json',
    subfolder: 'LTX',
    sourceUrl:
      'https://github.com/stuubszzz/Stubelius-Ultimate-LTX2.5/blob/main/example_workflows/Stubelius_Ultimate_LTX.json',
  },
  {
    id: 'minimax_h3_t2v_i2v_ref2v_advanced',
    engine: 'minimax-h3',
    filename: 'minimaxH3T2VI2VREF2VAdvanced_v20.json',
    subfolder: 'Minimax',
    sourceUrl:
      'https://civitai.com/models/2834514/minimax-h3-t2v-i2v-ref2v-advanced-filmmaking-workflow-or-all-speedups-qol-features?modelVersionId=3233131',
  },
  {
    id: 'minimax_h3_seed_hunter',
    engine: 'minimax-h3',
    filename: 'minimaxH3SEEDHUNTERLatent_v251.json',
    subfolder: 'Minimax',
    sourceUrl:
      'https://civitai.com/models/2881362/minimax-h3-seed-hunter-latent-upscaler-seamless-video-continuation-speedups-ref-mods?modelVersionId=3383710',
  },
  {
    id: 'h3_stubelius',
    engine: 'minimax-h3',
    filename: 'Stubelius_Ultimate_H3.json',
    subfolder: 'Minimax',
    sourceUrl:
      'https://github.com/stuubszzz/Stubelius-Ultimate-H3/blob/main/example_workflows/Stubelius_Ultimate_H3.json',
  },
  {
    id: 'minimax_h3_ref2va',
    engine: 'minimax-h3',
    filename: 'MiniMax_H3_Ref2VA_ComfyUI_Workflow.json',
    subfolder: 'Minimax',
  },
  {
    id: 'comfy-image-to-3d-glb',
    engine: '3d',
    filename: 'ComfyUI_Image_to_3D_GLB_Workflow.json',
    subfolder: '3d',
  },
  {
    id: 'comfy-text-to-3d-glb',
    engine: '3d',
    filename: 'ComfyUI_Text_to_3D_GLB_Workflow.json',
    subfolder: '3d',
  },
];

function resolveComfyWorkflowsDir(customDir) {
  if (customDir && fs.existsSync(customDir)) return customDir;
  for (const d of DEFAULT_COMFY_WORKFLOW_DIRS) {
    if (fs.existsSync(d)) return d;
  }
  // If D:\ComfyUI exists, ensure user/default/workflows directory is created
  if (fs.existsSync('D:\\ComfyUI')) {
    const target = 'D:\\ComfyUI\\user\\default\\workflows';
    try {
      fs.mkdirSync(target, { recursive: true });
      return target;
    } catch {
      // ignore
    }
  }
  return null;
}

function listFilesRecursive(baseDir, relPrefix = '', maxDepth = 2) {
  if (!baseDir || !fs.existsSync(baseDir) || maxDepth < 0) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const full = path.join(baseDir, entry.name);
      if (entry.isDirectory()) {
        results.push(...listFilesRecursive(full, rel, maxDepth - 1));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        results.push(rel);
      }
    }
  } catch {
    // ignore
  }
  return results;
}

function getComfyWorkflowSyncStatus(customDir) {
  const comfyDir = resolveComfyWorkflowsDir(customDir);
  const existingRelative = comfyDir ? listFilesRecursive(comfyDir) : [];
  const existingBasenames = new Set(
    existingRelative.map((r) => path.basename(r).toLowerCase())
  );

  const syncedDefaultFiles = [];
  const missingDefaultFiles = [];

  for (const item of BUNDLED_DEFAULT_WORKFLOW_FILES) {
    if (existingBasenames.has(item.filename.toLowerCase())) {
      syncedDefaultFiles.push(item.filename);
    } else {
      missingDefaultFiles.push(item.filename);
    }
  }

  const allPresent = missingDefaultFiles.length === 0 && Boolean(comfyDir);
  return {
    ok: true,
    comfyDir,
    comfyWorkflowsDir: comfyDir,
    allDefaultPresent: allPresent,
    allPresent,
    totalCount: BUNDLED_DEFAULT_WORKFLOW_FILES.length,
    syncedCount: syncedDefaultFiles.length,
    missingCount: missingDefaultFiles.length,
    syncedDefaultFiles,
    missingDefaultFiles,
    existingWorkflows: existingRelative,
  };
}

function pushWorkflowToComfyHttpApi(port, relPath, rawJsonContent) {
  return new Promise((resolve) => {
    const encodedPath = encodeURIComponent(`workflows/${relPath.replace(/\\/g, '/')}`);
    const bodyBuf = Buffer.from(rawJsonContent, 'utf-8');
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/api/userdata/${encodedPath}?overwrite=true`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': bodyBuf.length,
          Origin: `http://127.0.0.1:${port}`,
          Referer: `http://127.0.0.1:${port}/`,
        },
        timeout: 2500,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(bodyBuf);
    req.end();
  });
}

async function syncWorkflowsToComfyUI(options = {}) {
  const { customWorkflows = [], overwrite = false, customDir, onlyFilename, onlyEngine } = options;
  const comfyDir = resolveComfyWorkflowsDir(customDir);
  const syncedFiles = [];
  const skippedFiles = [];
  const pushedToApi = [];

  // 1. Sync bundled default workflows from workflows/templates/ (including LTX-2.5, MiniMax H3, and 3D Image-to-3D / Text-to-3D)
  for (const item of BUNDLED_DEFAULT_WORKFLOW_FILES) {
    if (onlyFilename && item.filename.toLowerCase() !== String(onlyFilename).toLowerCase()) {
      continue;
    }
    if (onlyEngine && item.engine !== onlyEngine) {
      continue;
    }
    const srcPath = path.join(REPO_TEMPLATES_DIR, item.filename);
    if (!fs.existsSync(srcPath)) continue;
    const rawContent = fs.readFileSync(srcPath, 'utf-8');

    if (comfyDir) {
      const subDir = item.subfolder ? path.join(comfyDir, item.subfolder) : comfyDir;
      try {
        fs.mkdirSync(subDir, { recursive: true });
        const targetSubPath = path.join(subDir, item.filename);
        const targetRootPath = path.join(comfyDir, item.filename);
        const alreadyExists =
          fs.existsSync(targetSubPath) && fs.existsSync(targetRootPath);

        if (!alreadyExists || overwrite) {
          fs.writeFileSync(targetSubPath, rawContent, 'utf-8');
          fs.writeFileSync(targetRootPath, rawContent, 'utf-8');
          syncedFiles.push(item.filename);
        } else {
          skippedFiles.push(item.filename);
        }
      } catch {
        // ignore fs error
      }
    }

    // Also push via ComfyUI userdata HTTP API if running on 8188 or 8000 (both root and subfolder)
    const relSub = item.subfolder ? `${item.subfolder}/${item.filename}` : item.filename;
    const pushed8188 = await pushWorkflowToComfyHttpApi(8188, item.filename, rawContent);
    if (item.subfolder) {
      await pushWorkflowToComfyHttpApi(8188, relSub, rawContent);
    }
    if (pushed8188) {
      pushedToApi.push(item.filename);
    } else {
      const pushed8000 = await pushWorkflowToComfyHttpApi(8000, item.filename, rawContent);
      if (item.subfolder) {
        await pushWorkflowToComfyHttpApi(8000, relSub, rawContent);
      }
      if (pushed8000) pushedToApi.push(item.filename);
    }
  }

  // 2. Sync any user-added custom workflows passed from frontend
  if (Array.isArray(customWorkflows)) {
    for (const cw of customWorkflows) {
      if (!cw || !cw.filename || !cw.rawJson) continue;
      const safeName = path.basename(String(cw.filename)).replace(/[^a-zA-Z0-9._ -]/g, '_');
      const finalName = safeName.toLowerCase().endsWith('.json') ? safeName : `${safeName}.json`;
      const rawContent =
        typeof cw.rawJson === 'string' ? cw.rawJson : JSON.stringify(cw.rawJson, null, 2);
      const subfolder =
        cw.subfolder ||
        (cw.engine === 'ltx-2.5'
          ? 'LTX'
          : cw.engine === 'minimax-h3'
          ? 'Minimax'
          : cw.engine === '3d'
          ? '3d'
          : '');

      if (comfyDir) {
        try {
          const subDir = subfolder ? path.join(comfyDir, subfolder) : comfyDir;
          fs.mkdirSync(subDir, { recursive: true });
          const targetSubPath = path.join(subDir, finalName);
          const targetRootPath = path.join(comfyDir, finalName);
          if (!fs.existsSync(targetSubPath) || !fs.existsSync(targetRootPath) || overwrite) {
            fs.writeFileSync(targetSubPath, rawContent, 'utf-8');
            fs.writeFileSync(targetRootPath, rawContent, 'utf-8');
            if (!syncedFiles.includes(finalName)) syncedFiles.push(finalName);
          }
        } catch {
          // ignore
        }
      }

      const pushed = await pushWorkflowToComfyHttpApi(8188, finalName, rawContent);
      if (subfolder) {
        await pushWorkflowToComfyHttpApi(8188, `${subfolder}/${finalName}`, rawContent);
      }
      if (pushed && !pushedToApi.includes(finalName)) {
        pushedToApi.push(finalName);
      }
    }
  }

  const statusAfter = getComfyWorkflowSyncStatus(customDir);
  return {
    ok: true,
    comfyDir,
    comfyWorkflowsDir: comfyDir,
    syncedFiles,
    skippedFiles,
    pushedToApi,
    allDefaultPresent: statusAfter.allDefaultPresent,
    allPresent: statusAfter.allDefaultPresent,
    totalCount: statusAfter.totalCount,
    syncedCount: statusAfter.syncedCount,
    missingCount: statusAfter.missingCount,
    existingWorkflows: statusAfter.existingWorkflows,
  };
}

function extractJsonFromZipBuffer(buf) {
  const results = [];
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return results;

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries && ptr + 46 <= buf.length; idx++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const compression = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const uncompressedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');

    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.toLowerCase().endsWith('.json') && !name.includes('__MACOSX') && compressedSize > 0) {
      if (
        localHeaderOffset + 30 <= buf.length &&
        buf.readUInt32LE(localHeaderOffset) === 0x04034b50
      ) {
        const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const slice = buf.subarray(dataStart, dataStart + compressedSize);
        try {
          const raw = compression === 0 ? slice : zlib.inflateRawSync(slice);
          const text = raw.toString('utf8');
          JSON.parse(text);
          results.push({ name: path.basename(name), text, size: uncompressedSize });
        } catch {
          // ignore invalid json inside zip
        }
      }
    }
  }
  return results;
}

async function fetchRemoteWorkflowJson(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    throw new Error('Empty workflow URL');
  }

  // 1. Check if the URL matches one of our 6 bundled default workflows offline
  for (const item of BUNDLED_DEFAULT_WORKFLOW_FILES) {
    if (
      item.sourceUrl &&
      (trimmed.toLowerCase() === item.sourceUrl.toLowerCase() ||
        (item.sourceUrl.includes('modelVersionId=') &&
          trimmed.includes(item.sourceUrl.split('modelVersionId=')[1])))
    ) {
      const localPath = path.join(REPO_TEMPLATES_DIR, item.filename);
      if (fs.existsSync(localPath)) {
        return {
          ok: true,
          filename: item.filename,
          rawJson: fs.readFileSync(localPath, 'utf-8'),
          source: 'bundled',
        };
      }
    }
  }

  // 2. Civitai model / modelVersion URL resolution
  let downloadUrl = trimmed;
  let suggestedFilename = 'custom_workflow.json';

  const civitaiVerMatch = trimmed.match(/modelVersionId=(\d+)/i) || trimmed.match(/civitai\.com\/api\/download\/models\/(\d+)/i);
  const civitaiModelMatch = trimmed.match(/civitai\.com\/models\/(\d+)/i);

  if (civitaiVerMatch) {
    const versionId = civitaiVerMatch[1];
    const metaRes = await fetch(`https://civitai.com/api/v1/model-versions/${versionId}`);
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const f = (meta.files || [])[0];
      if (f?.downloadUrl) downloadUrl = f.downloadUrl;
      if (f?.name) suggestedFilename = f.name.replace(/\.zip$/i, '.json');
    } else {
      downloadUrl = `https://civitai.com/api/download/models/${versionId}`;
    }
  } else if (civitaiModelMatch) {
    const modelId = civitaiModelMatch[1];
    const metaRes = await fetch(`https://civitai.com/api/v1/models/${modelId}`);
    if (metaRes.ok) {
      const meta = await metaRes.json();
      const ver = (meta.modelVersions || [])[0];
      const f = (ver?.files || [])[0];
      if (f?.downloadUrl) downloadUrl = f.downloadUrl;
      if (f?.name) suggestedFilename = f.name.replace(/\.zip$/i, '.json');
    }
  } else {
    // GitHub blob -> raw
    const ghMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
    if (ghMatch) {
      downloadUrl = `https://raw.githubusercontent.com/${ghMatch[1]}/${ghMatch[2]}/${ghMatch[3]}`;
      suggestedFilename = path.basename(ghMatch[3]);
    }
  }

  const dlRes = await fetch(downloadUrl);
  if (!dlRes.ok) {
    throw new Error(`HTTP ${dlRes.status} (${dlRes.statusText}) fetching workflow from ${downloadUrl}`);
  }

  const buf = Buffer.from(await dlRes.arrayBuffer());
  // Check if ZIP magic bytes (PK\x03\x04)
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) {
    const extracted = extractJsonFromZipBuffer(buf);
    if (extracted.length === 0) {
      throw new Error('Downloaded archive (.zip) did not contain any valid ComfyUI .json workflow file.');
    }
    extracted.sort((a, b) => b.text.length - a.text.length);
    return {
      ok: true,
      filename: extracted[0].name || suggestedFilename,
      rawJson: extracted[0].text,
      source: 'remote-zip',
    };
  }

  const rawText = buf.toString('utf-8');
  return {
    ok: true,
    filename: suggestedFilename,
    rawJson: rawText,
    source: 'remote-json',
  };
}

function resolveComfyPortsToTry(targetUrl) {
  const portsToTry = [];
  if (targetUrl) {
    try {
      const u = new URL(String(targetUrl));
      if (u.port) {
        const p = Number(u.port);
        if (p > 0 && p !== 5173 && p !== 51731) {
          portsToTry.push(p);
        }
      }
    } catch {
      // ignore
    }
  }
  if (!portsToTry.includes(8188)) portsToTry.push(8188);
  if (!portsToTry.includes(8000)) portsToTry.push(8000);
  return portsToTry;
}

function sanitizeComfyPromptBuffer(reqPath, buf) {
  if (!buf || buf.length === 0) return buf;
  if (!String(reqPath || '').includes('/prompt')) return buf;
  try {
    const str = buf.toString('utf-8');
    if (
      !str.includes('9:16 (Vertical)') &&
      !str.includes('4:3 (Classic TV)') &&
      !str.includes('minimax_h3_turbo_v4_step600_ema.safetensors') &&
      !str.includes('MiniMax-H3-Ref2VA-Acc-8Step.safetensors')
    ) {
      return buf;
    }
    const fixed = str
      .replace(/9:16 \(Vertical\)/g, '9:16 (Portrait Widescreen)')
      .replace(/4:3 \(Classic TV\)/g, '4:3 (Standard)')
      .replace(
        /minimax_h3_turbo_v4_step600_ema\.safetensors|MiniMax-H3-Ref2VA-Acc-8Step\.safetensors/g,
        'minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors'
      );
    return Buffer.from(fixed, 'utf-8');
  } catch {
    return buf;
  }
}

function comfyRequestDirect(options = {}) {
  const {
    path: reqPath = '/system_stats',
    method = 'GET',
    headers = {},
    body = null,
    responseType = 'json',
    timeoutMs = 15000,
    targetUrl = null,
  } = options;

  const portsToTry = resolveComfyPortsToTry(targetUrl);
  const rawBodyBuf =
    body == null
      ? null
      : Buffer.isBuffer(body)
      ? body
      : typeof body === 'string'
      ? Buffer.from(body, 'utf-8')
      : Buffer.from(JSON.stringify(body), 'utf-8');
  const bodyBuf = sanitizeComfyPromptBuffer(reqPath, rawBodyBuf);

  return new Promise((resolve) => {
    const attemptPort = (idx) => {
      const port = portsToTry[idx];
      const outHeaders = {};
      for (const [k, v] of Object.entries(headers || {})) {
        if (!/^(host|origin|referer|accept-encoding|x-comfy-target)$/i.test(k) && v != null) {
          outHeaders[k] = v;
        }
      }
      outHeaders['Host'] = `127.0.0.1:${port}`;
      outHeaders['Origin'] = `http://127.0.0.1:${port}`;
      outHeaders['Referer'] = `http://127.0.0.1:${port}/`;
      outHeaders['Accept-Encoding'] = 'identity';
      if (bodyBuf && bodyBuf.length > 0) {
        outHeaders['Content-Length'] = bodyBuf.length;
      }

      const normPath = reqPath.startsWith('/') ? reqPath : `/${reqPath}`;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: normPath,
          method,
          headers: outHeaders,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const rawBuf = Buffer.concat(chunks);
            const status = res.statusCode || 200;
            const ok = status >= 200 && status < 300;
            if (responseType === 'base64') {
              resolve({
                ok,
                status,
                statusText: res.statusMessage || '',
                activePort: port,
                contentType: res.headers['content-type'] || 'application/octet-stream',
                base64: rawBuf.toString('base64'),
              });
              return;
            }
            const text = rawBuf.toString('utf-8');
            let data = null;
            if (responseType === 'json') {
              try {
                data = JSON.parse(text);
              } catch {
                data = null;
              }
            }
            resolve({
              ok,
              status,
              statusText: res.statusMessage || '',
              activePort: port,
              text,
              data,
            });
          });
        }
      );

      req.on('error', (err) => {
        if (idx + 1 < portsToTry.length) {
          attemptPort(idx + 1);
          return;
        }
        resolve({
          ok: false,
          status: 502,
          statusText: 'Bad Gateway',
          error: `ComfyUI unreachable on ports ${portsToTry.join(', ')}: ${err.message}`,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        if (idx + 1 < portsToTry.length) {
          attemptPort(idx + 1);
          return;
        }
        resolve({
          ok: false,
          status: 504,
          statusText: 'Gateway Timeout',
          error: `ComfyUI timed out after ${timeoutMs}ms on ports ${portsToTry.join(', ')}`,
        });
      });

      if (bodyBuf && bodyBuf.length > 0) {
        req.write(bodyBuf);
      }
      req.end();
    };

    attemptPort(0);
  });
}

function comfyUploadImageDirect(options = {}) {
  const {
    filename = 'frame.png',
    mimeType = 'image/png',
    base64Data = '',
    overwrite = true,
    targetUrl = null,
  } = options;

  const fileBuf = Buffer.from(base64Data, 'base64');
  const boundary = `----ComfyStudioBoundary${Date.now()}${Math.random().toString(16).slice(2)}`;
  const pre = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    'utf-8'
  );
  const mid = Buffer.from(
    `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="overwrite"\r\n\r\n` +
      `${overwrite ? 'true' : 'false'}\r\n` +
      `--${boundary}--\r\n`,
    'utf-8'
  );
  const multipartBody = Buffer.concat([pre, fileBuf, mid]);

  return comfyRequestDirect({
    path: '/upload/image',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: multipartBody,
    responseType: 'json',
    timeoutMs: 30000,
    targetUrl,
  });
}

function forwardComfyRequest(req, res, forwardPath) {
  // Buffer incoming request chunks so we can safely retry port 8000 if 8188 is offline
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const bodyBuf = sanitizeComfyPromptBuffer(forwardPath, Buffer.concat(chunks));
    const customTargetHeader = req.headers['x-comfy-target'];
    const portsToTry = resolveComfyPortsToTry(customTargetHeader);

    const attemptPort = (idx) => {
      const port = portsToTry[idx];
      const outHeaders = { ...req.headers };
      for (const k of Object.keys(outHeaders)) {
        if (/^(host|origin|referer|accept-encoding|x-comfy-target)$/i.test(k)) {
          delete outHeaders[k];
        }
      }
      outHeaders['host'] = `127.0.0.1:${port}`;
      outHeaders['origin'] = `http://127.0.0.1:${port}`;
      outHeaders['referer'] = `http://127.0.0.1:${port}/`;
      outHeaders['accept-encoding'] = 'identity';
      if (bodyBuf.length > 0) {
        outHeaders['content-length'] = bodyBuf.length;
      }

      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: forwardPath || '/',
          method: req.method,
          headers: outHeaders,
        },
        (proxyRes) => {
          const cleanHeaders = {};
          for (const [k, v] of Object.entries(proxyRes.headers || {})) {
            if (!/^access-control-allow-/i.test(k)) {
              cleanHeaders[k] = v;
            }
          }
          cleanHeaders['Access-Control-Allow-Origin'] = '*';
          cleanHeaders['Access-Control-Allow-Headers'] = '*';
          cleanHeaders['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
          cleanHeaders['Access-Control-Expose-Headers'] = '*';
          cleanHeaders['X-Comfy-Active-Port'] = String(port);
          res.writeHead(proxyRes.statusCode || 200, cleanHeaders);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (err) => {
        if (idx + 1 < portsToTry.length) {
          attemptPort(idx + 1);
          return;
        }
        if (!res.headersSent) {
          res.writeHead(502, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': '*',
          });
          res.end(
            JSON.stringify({
              error: `ComfyUI unreachable on ports ${portsToTry.join(', ')}: ${err.message}`,
            })
          );
        } else {
          res.destroy();
        }
      });

      if (bodyBuf.length > 0) {
        proxyReq.write(bodyBuf);
      }
      proxyReq.end();
    };

    attemptPort(0);
  });
}

module.exports = {
  BUNDLED_DEFAULT_WORKFLOW_FILES,
  resolveComfyWorkflowsDir,
  getComfyWorkflowSyncStatus,
  syncWorkflowsToComfyUI,
  fetchRemoteWorkflowJson,
  comfyRequestDirect,
  comfyUploadImageDirect,
  forwardComfyRequest,
};

