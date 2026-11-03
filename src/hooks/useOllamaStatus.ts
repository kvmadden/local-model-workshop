import { useState, useEffect, useCallback } from 'react';
import { OllamaStatus } from '../types/workshop';
import {
  checkOllamaStatus,
  resolveOllamaModel,
  resolveOllamaModelTag,
  OllamaModelResolution,
} from '../services/ollamaService';

export type UseOllamaStatusReturn = OllamaStatus & {
  status: OllamaStatus;
  refresh: () => Promise<void>;
  /** The installed tag for the requested model, or null. Never a substitute. */
  resolveModelTag: (preferredName: string) => string | null;
  /**
   * The full resolution, including a same-family model of a different version.
   * Use this to TELL the user what is installed; use `resolveModelTag` to
   * decide whether the requested model can actually run.
   */
  resolveModel: (preferredName: string) => OllamaModelResolution | null;
};

export function useOllamaStatus(): UseOllamaStatusReturn {
  const [status, setStatus] = useState<OllamaStatus>({
    available: false,
    models: [],
    loading: true,
  });

  const check = useCallback(async () => {
    setStatus((prev) => ({ ...prev, loading: true }));
    const result = await checkOllamaStatus();
    setStatus({
      available: result.available,
      models: result.models,
      loading: false,
      reason: result.reason,
    });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const resolveModelTag = useCallback(
    (preferredName: string) => {
      return resolveOllamaModelTag(preferredName, status.models);
    },
    [status.models]
  );

  const resolveModel = useCallback(
    (preferredName: string) => {
      return resolveOllamaModel(preferredName, status.models);
    },
    [status.models]
  );

  return {
    ...status,
    status,
    refresh: check,
    resolveModelTag,
    resolveModel,
  };
}

export function formatModelSize(bytes: number): string {
  if (bytes === 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}
