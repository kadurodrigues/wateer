# Wateer

A personal YouTube watch-later app. Videos arrive in a queue to be judged, and the ones
worth keeping are bookmarked into a tagged, browsable collection.

## Language

### Queue and triage

**Queue**:
Videos that have arrived but not yet been judged worth keeping.
_Avoid_: Recent, Up Next, watch-later list

**Triage**:
Watching a queued video to decide whether it is worth keeping. The queue exists to be
triaged, not to be kept.

**Bookmark**:
A mark meaning a video is worth keeping. Bookmarking moves a video out of the queue and
into the collection; it is the outcome of triage.
_Avoid_: save, favourite, star, pin

**Watched**:
A video that has been played to the end. A watched video that was never bookmarked has
been triaged and rejected, and is awaiting cleanup.

### Tags

**Tag**:
A label that exists in its own right, with a name and a colour. A tag belongs to the tag
library and persists whether or not any video uses it.
_Avoid_: label, category, keyword

**Tag library**:
The set of all tags that exist. Independent of any video, so a tag survives being removed
from every video that used it.

**Creating a tag**:
Adding a new tag to the tag library.

**Applying a tag**:
Attaching an existing tag to a bookmarked video. Only bookmarked videos can carry tags,
because tags organise the collection and the queue is not a collection.
_Avoid_: adding a tag — ambiguous between creating and applying
