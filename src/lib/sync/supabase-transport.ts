import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import { SyncError, type RemoteChange, type SyncTransport, type WriteBatch } from "./engine";
import { emptySnapshot, type RemoteSnapshot } from "./model";

type Client = SupabaseClient<Database>;
type TableName = keyof Database["public"]["Tables"];

/** PostgREST returns at most this many rows per request by default. */
const PAGE = 1000;

function toSyncError(error: PostgrestError | null, status: number): SyncError | null {
  if (!error) return null;
  // status 0: the request never got an answer (offline, DNS, CORS); 5xx and 429: try again.
  if (status === 0 || status >= 500 || status === 429) {
    return new SyncError("network", error.message);
  }
  // Unique violation: usually the same video added on two devices at once.
  if (error.code === "23505") return new SyncError("conflict", error.message);
  // Expired session: the client refreshes its token, so a retry should succeed.
  if (status === 401 || error.code === "PGRST301") return new SyncError("network", error.message);
  return new SyncError("rejected", `${error.code ?? status}: ${error.message}`);
}

async function check(request: PromiseLike<{ error: PostgrestError | null; status: number }>) {
  let result: { error: PostgrestError | null; status: number };
  try {
    result = await request;
  } catch (error) {
    throw new SyncError("network", error instanceof Error ? error.message : String(error));
  }
  const failure = toSyncError(result.error, result.status);
  if (failure) throw failure;
}

async function fetchAll<T extends TableName>(supabase: Client, table: T) {
  const rows: Database["public"]["Tables"][T]["Row"][] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error, status } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    const failure = toSyncError(error, status);
    if (failure) throw failure;
    // The select is untyped across a generic table name; the rows are this table's.
    rows.push(...((data ?? []) as unknown as Database["public"]["Tables"][T]["Row"][]));
    if (!data || data.length < PAGE) return rows;
  }
}

export function createSupabaseTransport(supabase: Client, userId: string): SyncTransport {
  return {
    async fetchSnapshot(): Promise<RemoteSnapshot> {
      try {
        const [videos, tags, videoTags, history, settings] = await Promise.all([
          fetchAll(supabase, "videos"),
          fetchAll(supabase, "tags"),
          fetchAll(supabase, "video_tags"),
          fetchAll(supabase, "history"),
          fetchAll(supabase, "user_settings"),
        ]);
        return {
          ...emptySnapshot(),
          videos: new Map(videos.map((r) => [r.id, r])),
          tags: new Map(tags.map((r) => [r.id, r])),
          videoTags: new Map(videoTags.map((r) => [`${r.video_id}:${r.tag_id}`, r])),
          history: new Map(history.map((r) => [r.video_id, r])),
          settings: settings[0] ?? null,
        };
      } catch (error) {
        if (error instanceof SyncError) throw error;
        throw new SyncError("network", error instanceof Error ? error.message : String(error));
      }
    },

    async write(batch: WriteBatch) {
      // Order matters: a link needs its video and tag; deletes cascade to links.
      if (batch.tags.length) {
        await check(supabase.from("tags").upsert(batch.tags, { onConflict: "id" }));
      }
      if (batch.videos.length) {
        await check(supabase.from("videos").upsert(batch.videos, { onConflict: "id" }));
      }
      if (batch.videoTags.length) {
        await check(
          supabase
            .from("video_tags")
            .upsert(batch.videoTags, { onConflict: "video_id,tag_id", ignoreDuplicates: true }),
        );
      }
      const linksByVideo = new Map<string, string[]>();
      for (const { videoId, tagId } of batch.deleteVideoTags) {
        linksByVideo.set(videoId, [...(linksByVideo.get(videoId) ?? []), tagId]);
      }
      for (const [videoId, tagIds] of linksByVideo) {
        await check(
          supabase.from("video_tags").delete().eq("video_id", videoId).in("tag_id", tagIds),
        );
      }
      if (batch.deleteVideos.length) {
        await check(supabase.from("videos").delete().in("id", batch.deleteVideos));
      }
      if (batch.deleteTags.length) {
        await check(supabase.from("tags").delete().in("id", batch.deleteTags));
      }
      if (batch.history.length) {
        await check(
          supabase.from("history").upsert(batch.history, { onConflict: "user_id,video_id" }),
        );
      }
      if (batch.deleteHistory.length) {
        await check(
          supabase
            .from("history")
            .delete()
            .eq("user_id", userId)
            .in("video_id", batch.deleteHistory),
        );
      }
      if (batch.settings) {
        await check(
          supabase.from("user_settings").upsert(batch.settings, { onConflict: "user_id" }),
        );
      }
    },

    subscribe(onChange, onReconnect) {
      const filter = `user_id=eq.${userId}`;
      let subscribedOnce = false;
      // Inserts and updates are filtered to this user (and RLS applies). Deletes can't be
      // filtered and carry only the primary key; the engine ignores keys it doesn't hold.
      const channel = supabase
        .channel(`sync:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "videos", filter },
          (p) => onChange({ table: "videos", type: "upsert", row: p.new as never }),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "videos", filter },
          (p) => onChange({ table: "videos", type: "upsert", row: p.new as never }),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "videos" }, (p) => {
          const id = (p.old as { id?: string }).id;
          if (id) onChange({ table: "videos", type: "delete", id });
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "tags", filter }, (p) =>
          onChange({ table: "tags", type: "upsert", row: p.new as never }),
        )
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tags", filter }, (p) =>
          onChange({ table: "tags", type: "upsert", row: p.new as never }),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "tags" }, (p) => {
          const id = (p.old as { id?: string }).id;
          if (id) onChange({ table: "tags", type: "delete", id });
        })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "video_tags", filter },
          (p) => onChange({ table: "video_tags", type: "upsert", row: p.new as never }),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "video_tags" }, (p) => {
          const old = p.old as { video_id?: string; tag_id?: string };
          if (old.video_id && old.tag_id) {
            onChange({
              table: "video_tags",
              type: "delete",
              videoId: old.video_id,
              tagId: old.tag_id,
            });
          }
        })
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "history", filter },
          (p) => onChange({ table: "history", type: "upsert", row: p.new as never }),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "history", filter },
          (p) => onChange({ table: "history", type: "upsert", row: p.new as never }),
        )
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "history" }, (p) => {
          const old = p.old as { user_id?: string; video_id?: string };
          if (old.user_id && old.video_id) {
            onChange({
              table: "history",
              type: "delete",
              userId: old.user_id,
              videoId: old.video_id,
            });
          }
        })
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_settings", filter },
          (p) => {
            if (p.eventType !== "DELETE") {
              onChange({ table: "user_settings", type: "upsert", row: p.new as never });
            }
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          // Events missed while disconnected are gone: catch up with a full fetch.
          if (subscribedOnce) onReconnect();
          subscribedOnce = true;
        });

      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}

export type { RemoteChange };
