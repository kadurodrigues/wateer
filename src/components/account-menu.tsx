import * as React from "react";
import {
  Cloud,
  CloudOff,
  Download,
  History,
  LogIn,
  LogOut,
  RefreshCw,
  TriangleAlert,
  Upload,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useAuth, type AccountProfile } from "@/components/auth-provider";
import { QueueHistoryDialog } from "@/components/queue-history";
import { useQueue } from "@/components/queue-provider";
import { useTheme } from "@/components/theme-provider";
import type { SyncStatus } from "@/lib/sync/engine";
import { cn } from "@/lib/utils";

/**
 * The account and settings menu in the queue panel's header: the avatar when signed
 * in, a person icon otherwise. Settings, backups and history live here.
 */
export function AccountMenu({ className }: { className?: string }) {
  const { autoPlayNext, setAutoPlayNext, exportBackup, importBackup, syncStatus } = useQueue();
  const { darkMode, setDarkMode } = useTheme();
  const { status, profile, signInWithGoogle, signOut } = useAuth();
  // Outside the menu content, which unmounts as soon as the menu closes.
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  function downloadBackup() {
    const blob = new Blob([exportBackup()], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `wateer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!importBackup(await file.text())) {
      toast.error("That file isn't a Wateer backup.");
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void handleFile(event)}
      />
      <QueueHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-8 shrink-0 rounded-full p-0 text-muted-foreground shadow-none drop-shadow-none hover:bg-muted hover:text-foreground hover:shadow-none",
              className,
            )}
            aria-label={
              status === "signed-in"
                ? `Account and settings for ${profile?.name ?? profile?.email ?? "you"}`
                : "Settings and sign in"
            }
          >
            {status === "signed-in" && profile ? (
              <ProfileAvatar profile={profile} className="size-8" />
            ) : (
              <UserRound
                className={cn("size-4", status === "loading" && "animate-pulse")}
                aria-hidden="true"
              />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="z-[60] w-72 rounded-2xl border-border p-2 shadow-xl"
        >
          {status === "signed-in" && profile && (
            <>
              <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 font-normal">
                <ProfileAvatar profile={profile} className="size-9" />
                <div className="min-w-0">
                  {profile.name && (
                    <p className="truncate text-sm font-semibold text-foreground">{profile.name}</p>
                  )}
                  {profile.email && (
                    <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
                  )}
                  {syncStatus && <SyncStatusLine status={syncStatus} />}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {status === "signed-out" && (
            <>
              <DropdownMenuItem
                className={actionRowClassName}
                onSelect={() => void signInWithGoogle()}
              >
                <LogIn className="h-4 w-4 text-muted-foreground" />
                Sign in with Google
              </DropdownMenuItem>
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                See your queue on every device.
              </p>
              <DropdownMenuSeparator />
            </>
          )}
          <SettingsToggleRow
            label="Auto-play next video"
            checked={autoPlayNext}
            onCheckedChange={setAutoPlayNext}
          />
          <SettingsToggleRow label="Dark Mode" checked={darkMode} onCheckedChange={setDarkMode} />
          <DropdownMenuSeparator />
          <DropdownMenuItem className={actionRowClassName} onSelect={downloadBackup}>
            <Download className="h-4 w-4 text-muted-foreground" />
            Export backup
          </DropdownMenuItem>
          <DropdownMenuItem
            className={actionRowClassName}
            onSelect={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 text-muted-foreground" />
            Import backup…
          </DropdownMenuItem>
          <DropdownMenuItem
            className={actionRowClassName}
            onSelect={() => {
              // Let the menu unmount before the dialog, so they don't stack.
              window.setTimeout(() => setHistoryOpen(true), 0);
            }}
          >
            <History className="h-4 w-4 text-muted-foreground" />
            History
          </DropdownMenuItem>
          {status === "signed-in" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className={actionRowClassName} onSelect={() => void signOut()}>
                <LogOut className="h-4 w-4 text-muted-foreground" />
                Sign out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

const SYNC_STATUS_TEXT: Record<SyncStatus, string> = {
  starting: "Syncing…",
  syncing: "Syncing…",
  synced: "Synced",
  offline: "Offline: changes will sync when you're back online",
  error: "Some changes couldn't sync",
};

function SyncStatusLine({ status }: { status: SyncStatus }) {
  const Icon =
    status === "synced"
      ? Cloud
      : status === "offline"
        ? CloudOff
        : status === "error"
          ? TriangleAlert
          : RefreshCw;
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1.5 text-xs",
        status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-3 w-3 shrink-0",
          (status === "syncing" || status === "starting") && "animate-spin",
        )}
        aria-hidden="true"
      />
      {SYNC_STATUS_TEXT[status]}
    </p>
  );
}

function ProfileAvatar({ profile, className }: { profile: AccountProfile; className?: string }) {
  const initial = (profile.name ?? profile.email ?? "?").charAt(0).toUpperCase();
  return (
    <Avatar className={className}>
      {profile.avatarUrl && (
        // Google's avatar host refuses requests that carry another site's referrer.
        <AvatarImage src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback className="bg-brand text-sm font-semibold text-brand-foreground">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

const actionRowClassName =
  "cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground focus:bg-muted";

function SettingsToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <DropdownMenuItem
      aria-checked={checked}
      className="cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-2.5 focus:bg-muted"
      onSelect={(event) => {
        event.preventDefault();
        onCheckedChange(!checked);
      }}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Switch checked={checked} tabIndex={-1} className="pointer-events-none" aria-hidden="true" />
    </DropdownMenuItem>
  );
}
