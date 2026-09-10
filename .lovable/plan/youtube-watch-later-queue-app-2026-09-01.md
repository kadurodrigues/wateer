# YouTube Watch-Later Queue App

## Goal
Build a single-page app where you can paste a YouTube URL to add it to a personal watch queue. The layout keeps the video player in the center and the queue list in a right-side panel.

## Decisions from clarifying questions
- **Auth & sync:** Local-only (no login). Queue lives in the browser.
- **Features:** Auto-fetch title/thumbnail, personal notes/tags, reorder and remove, mark as watched.
- **Visual style:** Present 3 design concepts first, then build the chosen direction.

## Product scope
- One main route (`/`) with a split-pane layout: player center, queue right.
- Add a video by pasting a YouTube URL; app extracts the video ID and fetches title + thumbnail without an API key (YouTube oEmbed / default thumbnail URL).
- Each queue item shows thumbnail, title, note/tags, watched state, and controls to play, reorder, edit note/tags, or remove.
- Queue persisted to `localStorage` and restored on load.
- Responsive: right panel collapses into a drawer/sheet on narrow screens.

## Technical approach
- **Stack:** TanStack Start + React 19 + Tailwind CSS v4 + shadcn/ui.
- **State:** React state backed by `localStorage`; no backend or Lovable Cloud needed.
- **YouTube metadata:**
  - Extract `videoId` from standard YouTube URLs.
  - Fetch title via `https://www.youtube.com/oembed?url=<url>&format=json`.
  - Thumbnail via `https://img.youtube.com/vi/<videoId>/mqdefault.jpg`.
- **Player:** Embedded YouTube iframe (`https://www.youtube.com/embed/<videoId>`).
- **Reorder:** Drag-and-drop within the queue list.

## Design plan
1. Generate 3 distinct visual directions with `design--create_directions`.
2. Let the user pick one direction via a prototype question.
3. Implement the chosen direction using the project's semantic design tokens in `src/styles.css`.

## Implementation steps
1. Update `src/routes/index.tsx` with app layout and SEO head metadata.
2. Create components:
   - `AddVideoForm` — URL input + add button.
   - `VideoPlayer` — responsive YouTube embed.
   - `QueuePanel` — scrollable right panel with list.
   - `QueueItem` — thumbnail, title, note/tags, watched toggle, play/remove/drag handles.
   - `QueueProvider` / hook — manage queue state and `localStorage` persistence.
3. Add utilities:
   - `extractYouTubeId(url)`
   - `fetchYouTubeTitle(url)`
4. Wire drag-and-drop reordering (e.g., `@dnd-kit` or native HTML5 drag-and-drop).
5. Add responsive behavior for the queue panel on mobile.
6. Verify build, preview, and localStorage persistence.

## Out of scope for this plan
- User accounts / cloud sync.
- YouTube API key integration or channel subscription actions.
- Public sharing of queues.
