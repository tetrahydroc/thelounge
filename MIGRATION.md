# Migrating to fHori/thelounge

This is a standalone fork of [The Lounge](https://github.com/thelounge/thelounge) maintained by fHori. It is **not** submitted upstream and will not be merged back — it exists to move faster on performance and search than upstream's release cadence allows. If you're currently running upstream `thelounge/thelounge` (or `tetrahydroc/thelounge`) and are considering switching to this fork, this document explains what's different, what it means for your existing install, and how to back out if you change your mind.

## TL;DR

- **Your data is compatible.** Point this fork at your existing `.thelounge` home directory (config, logs, uploads) and start it - no export/import step. The server runs its normal schema migrations automatically on first startup.
- **The first startup after upgrading will take longer than usual** if you have a large message history (see "The search migration" below) - this is expected, not a hang.
- **It's reversible** - `thelounge storage downgrade <version>` rolls the DB schema back (see "Is this reversible?"). Back up your data directory before upgrading anyway; it's the option that always works.
- **The Docker image moved.** If you were building/pulling from the old separate `docker-thelounge` packaging repo, that's gone - see "Docker users".

## What's changed

### Search: SQLite FTS5 (full-text index)

Message search used to be an unindexed `LIKE '%term%'` scan over every stored message. It now uses a SQLite FTS5 trigram index, which is meaningfully faster on large message histories (multi-second scans down to roughly 1-2 seconds against a real ~7M-row dataset in testing - don't expect the synthetic 1000x numbers sometimes quoted for FTS5 on tiny datasets).

The search UI also gained:

- Infinite scroll on search results (no more manually clicking "Show older messages").
- Resuming a search session after clicking into a result and coming back - the last search, its scroll position, and result count are remembered.
- A jump-to-date picker.

**Migration impact:** on first startup after upgrading, the server builds the FTS5 index from your existing message history in one blocking step before it finishes starting up. This is proportional to how many messages you have stored - for a small/medium instance it's unnoticeable; for a large one (millions of messages) budget real time for it and don't kill the process if it looks like it's taking a while. This is a normal, one-time schema migration (see "Is this reversible?" for how it fits into the existing migration system).

### Performance: the big one - the UI no longer freezes on large channels

The most significant change: opening or scrolling a channel with a very large history (`maxHistory: -1` channels holding tens of thousands of messages) used to freeze the browser tab's main thread, because every message in history was mounted as a real DOM element with no windowing. The message list is now virtualized (only messages near the viewport are ever mounted), which is the fix for that freeze.

**Known, deliberate tradeoff:** because off-screen messages no longer exist as real DOM nodes, you can no longer copy-paste a text selection that spans outside what's currently visible on screen (you'll only get the visible part), and the browser's native Ctrl+F won't find text in scrolled-away messages. This matches how most modern chat apps (Slack, Discord) already behave, and was an explicit tradeoff for the freeze fix, not an oversight.

This only affects the _default_ message list (Enhanced Search off, which is the default setting). The Enhanced Search message list has its own separate, older windowing approach and was not touched.

Related fixes bundled in the same effort:

- A `RangeError: Maximum call stack size exceeded` crash that could occur loading very large channels is fixed.
- WAL journal mode is now enabled for the message database (better write concurrency, standard SQLite practice for this workload).
- Unused icon fonts were stripped and an external CDN dependency (a source of both a privacy leak and a single point of failure) was removed, and HTTP response compression was added - all reduce initial page load size/time.

### Channels now stay "warm" when you switch away

Previously, switching away from a channel always trimmed it down to its last 100 messages, so switching back and then scrolling up meant an immediate re-fetch. Now, a small number of recently-left channels (default 5, configurable 0-20 via **Settings → General → Performance**) stay fully loaded in memory, so bouncing between a handful of channels is instant. This trades a bit more memory for that responsiveness; set it to 0 to get the old always-trim behavior back.

### A stale-build notice

If a browser tab is left open across a server rebuild/redeploy, it now shows a small banner ("A new version of the UI is available") with a reload button, instead of silently continuing to run old JS. It checks every 10 minutes plus once on load.

### Docker/CI

- The separate `docker-thelounge` packaging repo is retired - Docker build/publish now lives directly in this repo (`.github/workflows/docker-publish.yml`).
- macOS was dropped from the CI build matrix (not a supported target for this fork going forward).
- Renovate is configured for dependency updates.

## Is this reversible?

**Code-level: yes, trivially** - it's a git fork, revert to any prior commit or go back to running upstream `thelounge/thelounge` on the same data directory at any time.

**Database schema-level: yes, via a CLI command.** The Lounge's existing (upstream) migration framework - which this fork uses unmodified - tracks every schema change with a matching rollback statement, including the FTS5 migration added here (`DROP TRIGGER`/`DROP TABLE`, cleanly removing the search index and nothing else). Run:

```
thelounge storage version [username]     # check the current schema version first
thelounge storage downgrade <version> [username]
```

to go back to an older schema version - `username` is optional (all users if omitted). This prompts for confirmation before doing anything, since it's a destructive operation past that point (only recoverable via a backup, not another downgrade). To go back specifically to running tetrahydroc/thelounge's code on the same data directory, the version to downgrade to is `1785000000000` - the schema version this fork diverged from (confirmed via `git show bbbb075d^:server/plugins/messageStorage/sqlite.ts`). **Caveat:** that's this fork's divergence point, not necessarily tetrahydroc/thelounge's schema version _today_ - if they've kept developing independently since, check their own `currentSchemaVersion` constant in `server/plugins/messageStorage/sqlite.ts` before relying on `1785000000000` being correct.

**Practical recommendation:** back up your `.thelounge` home directory (specifically the `logs/*.sqlite3` files and `config.js`) before upgrading, the same way you should before any thelounge version bump, regardless of the above - it's the one option that's always simple and always works.

**Settings-level:** the new channel-cache slider defaults to 5 (a behavior change from upstream's always-trim-to-100); set it to 0 in Settings if you want that old behavior back. Nothing else changed here requires user action.

## Docker users

If you were pulling from the old `fHori/docker-thelounge` repo/image, switch to:

```
ghcr.io/fhori/thelounge:latest
```

built and published directly from this repo now. Volumes/environment variables are unchanged from upstream's Docker setup - no data migration needed there either.

## Where to file issues

This fork's issues live at `github.com/fHori/thelounge` - not upstream `thelounge/thelounge`. (Note: `package.json`'s `repository` field still points at upstream as of this writing; that's a known inconsistency, not a redirect - please file here regardless of what that field says.)
