import * as React from "react";
import { Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueue } from "@/components/queue-provider";
import { cn } from "@/lib/utils";

export function AddVideoForm({ className }: { className?: string }) {
  const { addItem } = useQueue();
  const [url, setUrl] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isAdding) return;
    setIsAdding(true);
    await addItem(trimmed);
    setIsAdding(false);
    setUrl("");
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex min-w-0 gap-3", className)}>
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Link2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <Input
          type="url"
          placeholder="Paste video link..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full rounded-2xl border-0 bg-muted py-6 pl-11 pr-4 text-sm shadow-none ring-offset-0 placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand"
        />
      </div>
      <Button
        type="submit"
        disabled={isAdding || !url.trim()}
        className="shrink-0 rounded-2xl bg-brand px-6 py-6 text-sm font-semibold text-brand-foreground shadow-lg shadow-brand/25 hover:bg-brand-hover"
      >
        {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add to Queue"}
      </Button>
    </form>
  );
}
