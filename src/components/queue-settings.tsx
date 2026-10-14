import * as React from "react";
import { Download, Settings, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useQueue } from "@/components/queue-provider";
import { useTheme } from "@/components/theme-provider";

export function QueueSettings() {
  const { autoPlayNext, setAutoPlayNext, exportBackup, importBackup } = useQueue();
  const { darkMode, setDarkMode } = useTheme();
  // Outside the menu content, which unmounts as soon as the menu closes.
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-xl text-muted-foreground shadow-none drop-shadow-none hover:bg-muted hover:text-foreground hover:shadow-none"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="z-[60] w-64 rounded-2xl border-border p-2 shadow-xl"
        >
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
        </DropdownMenuContent>
      </DropdownMenu>
    </>
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
