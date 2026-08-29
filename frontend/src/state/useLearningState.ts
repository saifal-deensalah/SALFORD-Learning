import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionUser } from '../services/api';

export interface LearningState {
  onboarded: boolean;
  bookmarks: string[];
  progress: Record<string, number>;
  history: string[];
  plan: 'Basic' | 'Pro' | 'Premium' | null;
  notifications: boolean;
}
export const initialState: LearningState = {
  onboarded: false,
  bookmarks: [],
  progress: {},
  history: [],
  plan: null,
  notifications: true,
};
export const STORAGE_KEY = 'salford.learning.v2.guest';
export function readLearningState(value: string | null): LearningState {
  if (!value) {
    return initialState;
  }
  try {
    const data = JSON.parse(value);
    if (!data || typeof data !== 'object') {
      return initialState;
    }
    return {
      onboarded: data.onboarded === true,
      bookmarks: Array.isArray(data.bookmarks)
        ? data.bookmarks.filter((s: unknown) => typeof s === 'string')
        : [],
      history: Array.isArray(data.history)
        ? data.history.filter((s: unknown) => typeof s === 'string')
        : [],
      progress: Object.fromEntries(
        Object.entries(data.progress || {})
          .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
          .map(([k, v]) => [k, Math.min(100, Math.max(0, v as number))]),
      ),
      plan: ['Basic', 'Pro', 'Premium'].includes(data.plan) ? data.plan : null,
      notifications: data.notifications !== false,
    };
  } catch {
    return initialState;
  }
}
export function useLearningState() {
  const storageKey = getSessionUser()
    ? `salford.learning.v2.${getSessionUser()!.id}`
    : STORAGE_KEY;
  const [state, setState] = useState<LearningState>(initialState);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey)
      .then(value => {
        if (active) {
          setState(readLearningState(value));
        }
      })
      .catch(() => {
        if (active) {
          setStorageError(true);
        }
      })
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [storageKey]);
  useEffect(() => {
    if (!ready) {
      return;
    }
    // Only learning preferences persist. Never store passwords, card details or CVV.
    AsyncStorage.setItem(storageKey, JSON.stringify(state)).catch(() =>
      setStorageError(true),
    );
  }, [state, ready, storageKey]);
  const toggleBookmark = useCallback(
    (id: string) =>
      setState(s => ({
        ...s,
        bookmarks: s.bookmarks.includes(id)
          ? s.bookmarks.filter(v => v !== id)
          : [...s.bookmarks, id],
      })),
    [],
  );
  const recordProgress = useCallback(
    (id: string, percent: number) =>
      setState(s => ({
        ...s,
        history: [id, ...s.history.filter(v => v !== id)],
        progress: {
          ...s.progress,
          [id]: Math.max(
            s.progress[id] || 0,
            Number.isFinite(percent)
              ? Math.max(0, Math.min(100, Math.round(percent)))
              : 0,
          ),
        },
      })),
    [],
  );
  return {
    state,
    setState,
    ready,
    storageError,
    toggleBookmark,
    recordProgress,
  };
}
