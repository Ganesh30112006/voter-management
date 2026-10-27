import { useSyncExternalStore } from 'react';

/**
 * Which Corporator's team a Super Admin is viewing ('' = the shared voter list and every team's payments).
 * Sent as X-Team-Id on every request; Corporators and BLOs always see their own team, so the server ignores it.
 */
const KEY = 'vms-team-view';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

let current = read();

export const teamView = {
  get: (): string => current,
  set(teamId: string): void {
    current = teamId;
    try {
      if (teamId) sessionStorage.setItem(KEY, teamId);
      else sessionStorage.removeItem(KEY);
    } catch {
      // The choice then lasts until the page reloads.
    }
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useTeamView(): string {
  return useSyncExternalStore(teamView.subscribe, teamView.get);
}
