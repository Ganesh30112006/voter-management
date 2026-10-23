import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { wardService } from '../services/wardService';
import type { Booth, Ward } from '../types';

interface WardsState {
  wards: Ward[];
  booths: Booth[];
  loaded: boolean;
  wardLabel: (wardId: string) => string;
  boothLabel: (boothId: string) => string;
  boothsForWard: (wardId: string) => Booth[];
  reload: () => Promise<void>;
}

const WardsContext = createContext<WardsState | null>(null);

/** Ward and booth reference data shared by filters, forms and tables. */
export function WardsProvider({ children }: { children: ReactNode }) {
  const [wards, setWards] = useState<Ward[]>([]);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await wardService.list();
      setWards(res.wards);
      setBooths(res.booths);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  const value = useMemo<WardsState>(() => {
    const wardById = new Map(wards.map((w) => [w.id, w]));
    const boothById = new Map(booths.map((b) => [b.id, b]));
    return {
      wards,
      booths,
      loaded,
      wardLabel: (id) => {
        const w = wardById.get(id);
        return w ? `Ward ${w.number}` : '—';
      },
      boothLabel: (id) => {
        const b = boothById.get(id);
        return b ? `Booth ${b.number}` : '—';
      },
      boothsForWard: (wardId) => booths.filter((b) => b.wardId === wardId),
      reload,
    };
  }, [wards, booths, loaded, reload]);

  return <WardsContext.Provider value={value}>{children}</WardsContext.Provider>;
}

export function useWards(): WardsState {
  const ctx = useContext(WardsContext);
  if (!ctx) throw new Error('useWards must be used inside WardsProvider');
  return ctx;
}
