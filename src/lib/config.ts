export interface RuntimeConfig {
  cesiumIonToken: string;
}

const ION_KEY = 'cesiumIonToken';

/** The static site has no server config: each user brings their own ion token, kept in this browser. */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  let token = '';
  try {
    token = localStorage.getItem(ION_KEY) ?? '';
  } catch {
    // Storage blocked (private mode): run without ion.
  }

  return Promise.resolve({ cesiumIonToken: token });
}

/** Returns false when storage is blocked and the token could not be kept. */
export function saveIonToken(token: string): boolean {
  try {
    if (token) localStorage.setItem(ION_KEY, token);
    else localStorage.removeItem(ION_KEY);
    return true;
  } catch {
    return false;
  }
}

const OPENAIP_KEY = 'openaipKey';

export function loadOpenAipKey(): string {
  try {
    return localStorage.getItem(OPENAIP_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Returns false when storage is blocked and the key could not be kept. */
export function saveOpenAipKey(key: string): boolean {
  try {
    if (key) localStorage.setItem(OPENAIP_KEY, key);
    else localStorage.removeItem(OPENAIP_KEY);
    return true;
  } catch {
    return false;
  }
}
