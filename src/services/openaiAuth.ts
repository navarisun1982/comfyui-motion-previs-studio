/**
 * OpenAI Browser Authentication Service
 * Manages OAuth 2.0 PKCE authentication with OpenAI / ChatGPT subscriber accounts,
 * status detection from local configuration (~/.codex/auth.json & ~/.config/cozyclay/codex-auth.json),
 * and automatic session refreshes.
 */

export interface OpenAiAuthModel {
  id: string;
  label: string;
}

export interface OpenAiAuthStatus {
  authenticated: boolean;
  email?: string;
  name?: string;
  plan?: string;
  accountId?: string;
  expiresAt?: number;
  activeModel?: string;
  availableModels: OpenAiAuthModel[];
}

let cachedStatus: OpenAiAuthStatus = {
  authenticated: false,
  availableModels: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (Flagship Reasoning · Recommended)' },
    { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (Next-Gen Frontier)' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna (Fast Reasoning)' },
  ],
};

const listeners = new Set<(status: OpenAiAuthStatus) => void>();

export function subscribeOpenAiAuth(listener: (status: OpenAiAuthStatus) => void): () => void {
  listeners.add(listener);
  listener(cachedStatus);
  return () => {
    listeners.delete(listener);
  };
}

function notify(status: OpenAiAuthStatus) {
  cachedStatus = status;
  for (const listener of listeners) {
    try {
      listener(status);
    } catch (e) {
      console.error('[OpenAI Auth] Listener error:', e);
    }
  }
}

function getApiBase(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export async function fetchOpenAiAuthStatus(): Promise<OpenAiAuthStatus> {
  try {
    const res = await fetch(`${getApiBase()}/api/openai/auth/status`);
    if (res.ok) {
      const data: OpenAiAuthStatus = await res.json();
      notify(data);
      return data;
    }
  } catch (err: any) {
    console.warn('[OpenAI Auth] Failed to fetch auth status:', err.message);
  }
  return cachedStatus;
}

export async function startOpenAiBrowserLogin(): Promise<{ authorizeUrl: string; state: string }> {
  const res = await fetch(`${getApiBase()}/api/openai/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to initialize login' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data;
}

export async function logoutOpenAi(): Promise<void> {
  try {
    await fetch(`${getApiBase()}/api/openai/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.warn('[OpenAI Auth] Logout error:', err.message);
  }
  notify({
    authenticated: false,
    availableModels: cachedStatus.availableModels,
  });
}

/**
 * Polls status every second after browser sign-in is launched until authenticated or timed out.
 */
export async function pollUntilLoggedIn(timeoutMs = 120_000): Promise<OpenAiAuthStatus> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await fetchOpenAiAuthStatus();
    if (status.authenticated) {
      return status;
    }
  }
  throw new Error('Sign in timed out. Please try again.');
}
