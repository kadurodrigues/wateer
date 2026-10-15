// Applies every migration to an in-memory Postgres (PGlite) and checks the
// row-level security policies by acting as two different signed-in users.
import { beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(import.meta.dir, "..", "migrations");
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const VIDEO = "11111111-1111-1111-1111-111111111111";

const db = new PGlite();

/** Stand-ins for the parts of Supabase the migrations rely on. */
const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create publication supabase_realtime;
  insert into auth.users values ('${A}'), ('${B}');
`;

/** Run `sql` as a role, signed in as `user` (or signed out). */
async function as(user: string | null, sql: string, params: unknown[] = []) {
  const role = user ? "authenticated" : "anon";
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await db.query<Record<string, unknown>>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

const insertVideo = (user: string, id: string, videoId = "dQw4w9WgXcQ") =>
  as(
    user,
    `insert into public.videos (id, video_id, url, position)
     values ($1, $2, 'https://www.youtube.com/watch?v=' || $2, 1)`,
    [id, videoId],
  );

beforeAll(async () => {
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(MIGRATIONS).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await insertVideo(A, VIDEO);
});

describe("videos", () => {
  test("a user's rows default to their own id and are hidden from others", async () => {
    const own = await as(A, "select user_id from public.videos");
    expect(own.rows).toEqual([{ user_id: A }]);
    expect((await as(B, "select * from public.videos")).rows).toEqual([]);
  });

  test("signed-out visitors can't read anything", async () => {
    await expect(as(null, "select * from public.videos")).rejects.toThrow(/permission denied/);
  });

  test("no one can write rows for, or hand rows to, another user", async () => {
    await expect(
      as(
        B,
        "insert into public.videos (id, user_id, video_id, url, position) values (gen_random_uuid(), $1, 'jNQXAC9IVRw', 'u', 1)",
        [A],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(A, "update public.videos set user_id = $1 where id = $2", [B, VIDEO]),
    ).rejects.toThrow(/row-level security/);
  });

  test("other users' updates and deletes affect nothing", async () => {
    await as(B, "update public.videos set title = 'hacked' where id = $1", [VIDEO]);
    await as(B, "delete from public.videos where id = $1", [VIDEO]);
    expect((await as(A, "select title from public.videos")).rows).toEqual([{ title: null }]);
  });

  test("one row per YouTube video per user, but users don't collide", async () => {
    await expect(insertVideo(A, crypto.randomUUID())).rejects.toThrow(/duplicate key/);
    await insertVideo(B, crypto.randomUUID());
  });

  test("rejects malformed YouTube ids", async () => {
    await expect(insertVideo(A, crypto.randomUUID(), "not-an-id")).rejects.toThrow(/check/);
  });

  test("updated_at comes from the database, not the client", async () => {
    await as(
      A,
      "update public.videos set updated_at = '2000-01-01', watched = true where id = $1",
      [VIDEO],
    );
    const { rows } = await as(A, "select updated_at from public.videos where id = $1", [VIDEO]);
    expect((rows[0]!["updated_at"] as Date).getFullYear()).toBeGreaterThan(2000);
  });
});

describe("tags", () => {
  test("names are unique per user regardless of case, and colours are checked", async () => {
    await as(A, "insert into public.tags (name, color) values ('Music', 'blue')");
    await expect(
      as(A, "insert into public.tags (name, color) values ('music', 'red')"),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      as(A, "insert into public.tags (name, color) values ('x', 'purple')"),
    ).rejects.toThrow(/check/);
  });

  test("tags can only be applied within one account", async () => {
    const tagA = (await as(A, "select id from public.tags where name = 'Music'")).rows[0]!["id"];
    const tagB = (
      await as(B, "insert into public.tags (name, color) values ('Mine', 'red') returning id")
    ).rows[0]!["id"];

    await as(A, "insert into public.video_tags (video_id, tag_id) values ($1, $2)", [VIDEO, tagA]);
    await expect(
      as(A, "insert into public.video_tags (video_id, tag_id) values ($1, $2)", [VIDEO, tagB]),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(B, "insert into public.video_tags (video_id, tag_id) values ($1, $2)", [VIDEO, tagB]),
    ).rejects.toThrow(/row-level security/);
  });

  test("deleting a tag removes it from every video", async () => {
    await as(A, "delete from public.tags where name = 'Music'");
    expect((await as(A, "select * from public.video_tags")).rows).toEqual([]);
  });
});

describe("history and settings", () => {
  test("are private to their owner", async () => {
    await as(A, "insert into public.history (video_id, url) values ('dQw4w9WgXcQ', 'u')");
    await as(A, "insert into public.user_settings (auto_play_next) values (true)");
    const { rows } = await as(
      B,
      "select (select count(*) from public.history) + (select count(*) from public.user_settings) as n",
    );
    expect(Number(rows[0]!["n"])).toBe(0);
  });
});

test("every table is published for realtime", async () => {
  const { rows } = await db.query<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1",
  );
  expect(rows.map((r) => r.tablename)).toEqual([
    "history",
    "tags",
    "user_settings",
    "video_tags",
    "videos",
  ]);
});

test("deleting an account deletes all of its data", async () => {
  await db.query("delete from auth.users where id = $1", [A]);
  const { rows } = await db.query<{ n: number }>(
    `select (select count(*) from public.videos where user_id = $1)
          + (select count(*) from public.tags where user_id = $1)
          + (select count(*) from public.history where user_id = $1)
          + (select count(*) from public.user_settings where user_id = $1) as n`,
    [A],
  );
  expect(Number(rows[0]!.n)).toBe(0);
});
