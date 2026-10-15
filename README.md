# Wateer

A personal YouTube watch-later queue with a built-in player and a reorderable list.

The name is a portmanteau of **Wat**ch + La**ter**.

Paste a YouTube URL, and Wateer pulls the title and channel, drops the video at the
end of your queue, and plays it inline. Reorder by dragging (mouse or touch) or with
the arrow keys, tag the videos you bookmark, read a video's comments, and pick up
where you left off — playback position is remembered per video.

Everything is stored in your browser. Use **Settings → Export backup** to keep a copy.

## Development

You need Node.js — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
— and [Bun](https://bun.sh), which owns the lockfile.

```sh
git clone <this-repository-url>
cd wateer-app
bun install
npm run dev
```

| Script            | What it does                               |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Start the dev server                       |
| `npm run build`   | Production build                           |
| `npm run preview` | Serve the production build locally         |
| `npm test`        | Unit tests (runs `bun test`, so needs Bun) |
| `npm run lint`    | ESLint                                     |
| `npm run format`  | Prettier                                   |

### YouTube API key

Titles and channels come from YouTube's oEmbed endpoint and need no key. Durations,
comment counts and comments need a [YouTube Data API v3](https://developers.google.com/youtube/v3/getting-started)
key: copy `.env.example` to `.env` and set `YOUTUBE_API_KEY`. Without it the app still
works; those features are just unavailable. The key is only read on the server.

### Lockfiles

`bun.lock` is the committed source of truth, and Vercel installs with Bun because of
it. Running `npm install` locally creates a `package-lock.json`, which is gitignored
on purpose — committing both makes the package manager Vercel picks ambiguous. Use
`bun install` when changing dependencies so the committed lockfile stays accurate.

## Configuration

| Variable                        | Required | Purpose                                                   |
| ------------------------------- | -------- | --------------------------------------------------------- |
| `YOUTUBE_API_KEY`               | No       | Durations, comment counts and comments (server-side only) |
| `VITE_SUPABASE_URL`             | No       | Supabase project URL, for sign-in and sync across devices |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | No       | Supabase publishable key; safe in the browser, see below  |

Without the key, the app works normally — durations just show as unavailable, since
titles and channel names come from YouTube's public oEmbed endpoint instead.

The key is read server-side only, inside a TanStack server function. Do **not** give
it a `VITE_` prefix; that would bundle it into the client and expose it publicly.

For local development, put it in a `.env` file (already gitignored):

```sh
YOUTUBE_API_KEY=your-key-here
```

### Accounts and sync (Supabase)

Signing in syncs the queue, bookmarks, tags and history across devices. Without the
two `VITE_SUPABASE_*` variables the app is local-only, exactly as before. The design
is in [ADR 0002](docs/adr/0002-accounts-and-sync.md).

1. Create a project at [supabase.com](https://supabase.com) and run
   `supabase/migrations/*.sql` in order, in the dashboard's SQL editor (or with the
   Supabase CLI: `supabase link` then `supabase db push`).
2. Copy the **Project URL** and **publishable key** from _Project Settings → API_ into
   `.env`. The publishable key is designed to be public; row-level security limits
   each user to their own rows. Never use the secret (service role) key here.
3. For Google sign-in, create an OAuth client in Google Cloud Console and add its ID
   and secret under _Authentication → Providers → Google_.

`npm test` also runs `supabase/tests`, which applies the migrations to an in-memory
Postgres ([PGlite](https://pglite.dev)) and checks the security policies by acting as
two different users.

## Deployment

Deployed on Vercel, redeploying automatically on every push to `main`.

`vite.config.ts` pins Nitro to the `vercel` preset. Left unpinned, Nitro guesses a
target from the environment, so a local `npm run build` would emit a layout that
doesn't match Vercel's Build Output API. Nitro only runs on `build`; it has no role
in the dev server.

Set `YOUTUBE_API_KEY`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the
Vercel project's environment variables for Production, Preview, and Development.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
