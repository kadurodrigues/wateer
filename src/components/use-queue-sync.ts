import * as React from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import { initialQueueState, type QueueAction, type QueueState } from "@/lib/queue-state";
import { getSupabase } from "@/lib/supabase";
import {
  forgetSyncAccount,
  SyncEngine,
  type KeyValueStore,
  type SyncStatus,
} from "@/lib/sync/engine";
import { createSupabaseTransport } from "@/lib/sync/supabase-transport";

/** After this long in the background, the live connection may have missed changes. */
const STALE_AFTER_HIDDEN_MS = 60_000;

const browserStorage: KeyValueStore = {
  get: (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore quota / private-mode failures
    }
  },
};

export type SignOutResult =
  | { signedOut: true }
  /** `unsynced` changes couldn't reach the account (e.g. offline); call again with force. */
  | { signedOut: false; unsynced: number };

/**
 * Keeps the queue in sync with the signed-in account. `status` is null while signed
 * out, when the app is local-only.
 */
export function useQueueSync({
  state,
  stateRef,
  dispatch,
  loaded,
}: {
  state: QueueState;
  stateRef: React.RefObject<QueueState>;
  dispatch: React.Dispatch<QueueAction>;
  loaded: boolean;
}): {
  status: SyncStatus | null;
  signOut: (options?: { force?: boolean }) => Promise<SignOutResult>;
} {
  const { status: authStatus, user, signOut: endSession } = useAuth();
  const userId = authStatus === "signed-in" ? (user?.id ?? null) : null;
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus | null>(null);
  const engineRef = React.useRef<SyncEngine | null>(null);

  React.useEffect(() => {
    if (authStatus === "signed-out") forgetSyncAccount(browserStorage);
  }, [authStatus]);

  React.useEffect(() => {
    const supabase = getSupabase();
    if (!loaded || !userId || !supabase) {
      setSyncStatus(null);
      return;
    }

    const engine = new SyncEngine({
      transport: createSupabaseTransport(supabase, userId),
      userId,
      getState: () => stateRef.current,
      applyState: (next) => dispatch({ type: "sync", state: next }),
      storage: browserStorage,
      onStatus: setSyncStatus,
      onDropped: (error) => {
        console.error("Sync dropped changes the server rejected", error);
        toast.error("Some changes couldn't be saved to your account.");
      },
    });
    engineRef.current = engine;
    setSyncStatus("starting");
    void engine.start();

    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        engine.flushNow();
      } else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_HIDDEN_MS) {
        void engine.resync();
      }
    };
    const flushNow = () => engine.flushNow();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("online", flushNow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("online", flushNow);
      engine.stop();
      engineRef.current = null;
    };
  }, [loaded, userId, dispatch, stateRef]);

  React.useEffect(() => {
    engineRef.current?.noteLocalState(state);
  }, [state]);

  /**
   * Send what's pending, then sign out and clear this browser's copy; the account
   * keeps everything. The order matters: the engine stops, and this browser is marked
   * signed out (so engines in other tabs stand down), before anything is cleared, so
   * the clearing is never synced as deletions.
   */
  const signOut = React.useCallback(
    async ({ force = false }: { force?: boolean } = {}): Promise<SignOutResult> => {
      const engine = engineRef.current;
      if (engine && !force) {
        const unsynced = await engine.drain();
        if (unsynced > 0) return { signedOut: false, unsynced };
      }
      engine?.stop();
      forgetSyncAccount(browserStorage);
      if (!(await endSession())) return { signedOut: false, unsynced: 0 };
      dispatch({ type: "replace", state: initialQueueState });
      return { signedOut: true };
    },
    [dispatch, endSession],
  );

  return { status: syncStatus, signOut };
}
