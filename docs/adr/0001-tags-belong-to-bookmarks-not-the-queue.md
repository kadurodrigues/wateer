# Tags belong to bookmarks, not the queue

Only bookmarked videos can carry tags. The queue exists to be triaged — you watch a queued
video to decide whether it is worth keeping — so a queued video has not yet earned a place
in the collection, and organising it would be organising something you are about to discard.

We considered decoupling the two, so any video could be tagged. We rejected it because
tags have exactly one consumer, the tag filter over the collection, so a tag applied to a
queued video would have nowhere to filter it.

The gate is therefore deliberate, not an oversight: `VideoTagEditor` renders only when
`item.bookmarked` is true, and the card-level tag dialog is reachable only from the
Bookmarks tab. Reversing this means giving the queue its own tag filter first.
