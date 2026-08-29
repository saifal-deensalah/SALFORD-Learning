import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export function useData<T>(
  path: string | null,
  revision = 0,
): { data?: T; error?: string; loading: boolean; reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    path: string | null;
    data?: T;
    error?: string;
    loading: boolean;
  }>({ path, loading: !!path });
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let active = true;
    setResult(previous => ({
      path,
      data: previous.path === path ? previous.data : undefined,
      loading: !!path,
    }));
    if (path) {
      api<T>(path)
        .then(data => {
          if (active) {
            setResult({ path, data, loading: false });
          }
        })
        .catch(error => {
          if (active) {
            setResult({ path, error: error.message, loading: false });
          }
        });
    }
    return () => {
      active = false;
    };
  }, [path, revision, attempt]);
  return { ...(result.path === path ? result : { loading: !!path }), reload };
}
