# Wateer

A personal YouTube watch-later queue with a built-in player and a reorderable list.

The name is a portmanteau of **Wat**ch + La**ter**.

Paste a YouTube URL, and Wateer pulls the title and channel, drops the video at the
end of your queue, and plays it inline. Reorder by dragging, tag the videos you
bookmark, and pick up where you left off — playback position is remembered per video.

## Development

You need Node.js — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd wateer-app
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

### Lockfiles

`bun.lock` is the committed source of truth, because the Lovable editor builds with
Bun. Running `npm install` locally creates a `package-lock.json`, which is gitignored
on purpose — committing both makes the package manager Vercel picks ambiguous.

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | No | Fetches video durations via the YouTube Data API v3 |

Without the key, the app works normally — durations just show as unavailable, since
titles and channel names come from YouTube's public oEmbed endpoint instead.

The key is read server-side only, inside a TanStack server function. Do **not** give
it a `VITE_` prefix; that would bundle it into the client and expose it publicly.

For local development, put it in a `.env` file (already gitignored):

```sh
YOUTUBE_API_KEY=your-key-here
```

## Deployment

Deployed on Vercel. `vite.config.ts` pins Nitro to the `vercel` preset — without it
the build defaults to `cloudflare-module` and the server functions won't run on
Vercel.

Set `YOUTUBE_API_KEY` in the Vercel project's environment variables for Production,
Preview, and Development.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Lovable

This project is also connected to [Lovable](https://lovable.dev). Commits pushed to
the connected branch sync back into the Lovable editor, so keep that branch working
and avoid rewriting published history.
