import {nextTick} from "vue";

import socket from "../socket";
import {store} from "../store";
import {markMsgsRaw, unshiftMany} from "../chan";

// Handle a chunk of history fetched directly from the message storage database
// (see server `messages:around` handler). This is the "skip to chunk" primitive:
// instead of paging through every in-memory message with repeated `more` calls,
// the server fetched a window of messages around a timestamp we asked for.
socket.on("messages:around", async (data) => {
	const channel = store.getters.findChannel(data.chan)?.channel;

	if (!channel) {
		return;
	}

	// Only merge messages not already present in memory. Ids are stable (stored
	// in the DB JSON for recent messages, SQLite row ids for older ones).
	const known = new Set<number>(channel.messages.map((m) => m.id));
	const fresh = data.messages.filter((m) => !known.has(m.id));

	if (fresh.length > 0) {
		// Oldest messages first, matching the order `more` uses
		unshiftMany(channel.messages, markMsgsRaw(fresh));
	}

	// Directional: whether there's more history *before* the target, not
	// just whether the combined before+after chunk was large. A target with
	// abundant history before it but little/none after (e.g. a fairly
	// recent message) would otherwise be misreported as "no more history",
	// silently breaking "Show older messages" / scroll-triggered auto-load.
	channel.moreHistoryAvailable = data.hasMoreBefore;
	channel.historyLoading = false;

	await nextTick();
});