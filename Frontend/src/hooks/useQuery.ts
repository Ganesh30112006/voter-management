import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/apiError';

interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads data whenever `key` changes. Earlier responses that arrive late are ignored,
 * and the previous data stays visible while a reload is in flight.
 */
export function useQuery<T>(fetcher: () => Promise<T>, key: string): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload };
}
