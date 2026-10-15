import * as React from "react";
import { Cloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { useQueue } from "@/components/queue-provider";

/** Enough videos that losing this browser's copy would hurt. */
const NUDGE_AFTER_VIDEOS = 5;
const DISMISSED_KEY = "wateer-signin-nudge-dismissed";

/**
 * A soft suggestion to sign in once the signed-out queue is worth keeping. Never
 * required; dismissing it hides it for good on this browser.
 */
export function SignInNudge() {
  const { status, signInWithGoogle } = useAuth();
  const { items } = useQueue();
  // Read after mount: storage isn't available during server rendering.
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (status !== "signed-out" || dismissed || items.length < NUDGE_AFTER_VIDEOS) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore quota / private-mode failures; it stays hidden for this visit
    }
  }

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand-soft px-4 py-3"
    >
      <Cloud className="size-5 shrink-0 text-brand" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-xs font-medium text-foreground">
        Sign in to see your queue on your phone.
      </p>
      <Button
        type="button"
        size="sm"
        variant="brand"
        className="h-8 shrink-0 rounded-full px-3 text-xs"
        onClick={() => void signInWithGoogle()}
      >
        Sign in
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0 rounded-full text-muted-foreground"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
