const KEY = 'vms-token';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** "Remember me" keeps the token in localStorage; otherwise it lasts for the browser session. */
export const tokenStorage = {
  get(): string | null {
    return safe(() => sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY), null);
  },
  set(token: string, remember: boolean): void {
    safe(() => {
      this.clear();
      (remember ? localStorage : sessionStorage).setItem(KEY, token);
    }, undefined);
  },
  clear(): void {
    safe(() => {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
    }, undefined);
  },
};
