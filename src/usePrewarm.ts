import { useEffect } from 'react';
import { getSetting } from '@/db/settings';
import { modelExists, modelPath } from '@/model/storage';
import { getEngineForModel } from '@/engine';

/**
 * Eagerly load the active model on app boot when the user has opted in.
 *
 * Reads `prewarm_on_launch` from settings. If true and a model is installed
 * and the engine isn't already loaded, calls `engine.load()` once.
 *
 * Errors are silently swallowed — pre-warm is a UX optimization, not a hard
 * dependency. If load fails, the next user-initiated `send()` will surface
 * the error normally.
 */
export const usePrewarm = (): void => {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const want = await getSetting('prewarm_on_launch');
        if (!want) return;
        const id = await getSetting('active_model_id');
        if (!id) return;
        if (!(await modelExists(id))) return;
        const engine = getEngineForModel(id);
        if (engine.isReady()) return;
        if (cancelled) return;
        await engine.load(modelPath(id));
      } catch {
        // Silent — see doc above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
};
