import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useQueue } from "@/components/queue-provider";
import { useTheme } from "@/components/theme-provider";

export function QueueSettings() {
  const { autoPlayNext, setAutoPlayNext } = useQueue();
  const { darkMode, setDarkMode } = useTheme();

  return (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
