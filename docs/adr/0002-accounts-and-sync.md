# Accounts sync a local-first app through Supabase

Wateer kept everything in `localStorage`, so the queue on a laptop never reached the
phone. Signing in fixes that. The app is personal for now but should be able to open
to the public without a redesign.

## Supabase, with Google sign-in

We chose Supabase over Firebase. The data is relational — videos, tags, the tags on
each video, history — and Postgres row-level security states "a user sees only their
own rows" once, in `supabase/migrations`, so the browser can query the database
directly with the publishable key. Google is the sign-in provider because every
YouTube user already has a Google account.

The free plan pauses a project after a week without activity. Daily use keeps it
awake; a scheduled ping covers quiet weeks.

## The browser stays the working copy

`queueReducer` remains the source of truth on each device, and `localStorage` its
cache, so the app loads instantly and works offline. A sync layer diffs state before
and after each action and turns the difference into row upserts and deletes, queued
in an outbox until they reach Supabase. Realtime brings other devices' changes back in
as reducer actions. Diffing, rather than mapping each action to SQL, means every
existing action — undo, import, clearing watched videos — syncs without changes.

Conflicts resolve per row: the database stamps `updated_at`, and the newest write
wins. Per-row sync means editing on two devices doesn't overwrite unrelated changes,
which syncing the whole state as one document would.

Order is a `position` number per video; moving a video gives it a value between its
new neighbours, so a reorder writes one row. Playback position is the only
high-frequency field, so it is sent at most every 15 seconds and on pause or switch.
Which video is playing stays per device, as it is per tab today.

## Signed out still works

The app opens straight into the queue whether or not you're signed in; signing in
is offered, never required. After a few videos, a dismissible prompt suggests it. On
first sign-in, the browser's videos merge into the account by YouTube video ID,
keeping the account's version where both exist. Signing out clears the browser's
copy, since the account holds everything.

## Before opening to the public

Not built yet, but nothing here blocks it: per-account rate limits on the YouTube
server functions (today they limit per IP), possibly requiring sign-in for comments
since they spend the API quota, account deletion (already cascades in the schema),
and a privacy note. Realtime delete events carry only the deleted row's primary key,
which for most tables is a random UUID.
