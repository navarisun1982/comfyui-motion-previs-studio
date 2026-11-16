/**
 * Canonical Local Studio API Origin Resolver
 *
 * - Under `http://` / `https://` (Vite dev server `:5173` or `vite preview` `:4173`), relative `/api/...`
 *   paths hit the active Vite HTTP server directly.
 * - Under `file://` (packaged Electron desktop build loading `dist/index.html`), relative `/api/...`
 *   paths would resolve to `file:///C:/api/...` and fail; instead they must target Electron's
 *   embedded loopback proxy on `http://127.0.0.1:51731`.
 */

export const ELECTRON_LOCAL_API_ORIGIN = 'http://127.0.0.1:51731';

export function getLocalApiBase(): string {
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return ELECTRON_LOCAL_API_ORIGIN;
  }
  return '';
}

export function resolveLocalApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith('/api/') || pathOrUrl.startsWith('/__local_')) {
    const base = getLocalApiBase();
    return base ? `${base}${pathOrUrl}` : pathOrUrl;
  }
  return pathOrUrl;
}
