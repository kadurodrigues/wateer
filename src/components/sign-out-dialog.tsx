import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueue } from "@/components/queue-provider";

type Phase = { kind: "confirm" } | { kind: "working" } | { kind: "unsynced"; count: number };

/**
 * Signing out clears this browser's copy, so it asks first, and warns before throwing
 * away changes that never reached the account.
 */
export function SignOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { signOut } = useQueue();
  const [phase, setPhase] = React.useState<Phase>({ kind: "confirm" });

  React.useEffect(() => {
    if (open) setPhase({ kind: "confirm" });
  }, [open]);

  async function run(force: boolean) {
    setPhase({ kind: "working" });
    const result = await signOut({ force });
    if (result.signedOut) {
      onOpenChange(false);
      toast("Signed out. Your queue is safe in your account.");
    } else if (result.unsynced > 0) {
      setPhase({ kind: "unsynced", count: result.unsynced });
    } else {
      setPhase({ kind: "confirm" });
    }
  }

  const working = phase.kind === "working";
  const one = phase.kind === "unsynced" && phase.count === 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !working && onOpenChange(next)}>
      <DialogContent className="max-w-md rounded-2xl">
        {phase.kind === "unsynced" ? (
          <>
            <DialogHeader>
              <DialogTitle>Some changes haven't synced</DialogTitle>
              <DialogDescription>
                {phase.count} {one ? "change" : "changes"} made on this device{" "}
                {one ? "hasn't" : "haven't"} reached your account yet, probably because you're
                offline. Signing out now discards {one ? "it" : "them"}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Stay signed in
              </Button>
              <Button type="button" variant="destructive" onClick={() => void run(true)}>
                Sign out anyway
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Sign out?</DialogTitle>
              <DialogDescription>
                Your queue, bookmarks and tags stay in your account. This browser's copy is removed,
                so nothing is left behind on this device.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={working}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="brand"
                disabled={working}
                onClick={() => void run(false)}
              >
                {working && <Loader2 className="animate-spin" />}
                {working ? "Signing out…" : "Sign out"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
