import {reactive} from "vue";
import {condensedTypes} from "../../../shared/irc";
import {ChanType} from "../../../shared/types/chan";
import {ClientChan, ClientMessage} from "../types";
import {unshiftMany, pushMany} from "../chan";

export type CondensedMessageContainer = {
	type: "condensed";
	time: Date;
	messages: ClientMessage[];
	id?: number;
};

export type CondensedEntry = ClientMessage | CondensedMessageContainer;

type Mode = "raw" | "hidden" | "condensed";

function getMode(channel: ClientChan, statusMessages: string): Mode {
	if (channel.type !== ChanType.CHANNEL && channel.type !== ChanType.QUERY) {
		return "raw";
	}

	if (statusMessages === "hidden") {
		return "hidden";
	}

	if (statusMessages !== "condensed") {
		return "raw";
	}

	return "condensed";
}

// Fold a self-contained run of messages, starting with no open container.
// Pure/stateless - used for full rebuilds and for folding a freshly
// prepended chunk in isolation (see prependChunk's merge step below for why
// a prepend needs one extra step beyond just calling this).
function foldRun(
	messages: ClientMessage[],
	firstUnread: number
): {entries: CondensedEntry[]; openContainer: CondensedMessageContainer | null} {
	let container: CondensedMessageContainer | null = null;
	const entries: CondensedEntry[] = [];

	for (const message of messages) {
		if (message.self || message.highlight || !condensedTypes.has(message.type || "")) {
			container = null;
			entries.push(message);
			continue;
		}

		if (!container) {
			container = {time: message.time, type: "condensed", messages: []};
			entries.push(container);
		}

		container.messages.push(message);
		container.id = message.id;

		if (message.id === firstUnread) {
			container = null;
		}
	}

	return {entries, openContainer: container};
}

/**
 * Maintains the "condensed" (status-message-folding) view of a channel's
 * messages incrementally instead of rebuilding it from the whole array on
 * every change. A container with exactly one message is intentionally left
 * as `type: "condensed"` here (not unwrapped into a bare message) - the
 * template decides whether to render a single-message container as
 * MessageCondensed or as a plain Message by checking `messages.length`,
 * which avoids needing to flip an already-emitted array entry's shape as
 * more messages join or leave a container.
 */
export function useCondensedMessages(getChannel: () => ClientChan, getStatusMessages: () => string) {
	const condensed = reactive<CondensedEntry[]>([]) as CondensedEntry[];

	// Bookkeeping for appendOne(): the container currently open at the tail
	// of `condensed`, if any - null means the next condensable message
	// starts a new container. Only meaningful when builtMode === "condensed".
	let tailContainer: CondensedMessageContainer | null = null;
	let builtMode: Mode | null = null;
	let builtChannelId: number | null = null;

	function rebuildAll() {
		const channel = getChannel();
		const mode = getMode(channel, getStatusMessages());

		condensed.splice(0, condensed.length);
		tailContainer = null;

		if (mode === "raw") {
			pushMany(condensed, channel.messages);
		} else if (mode === "hidden") {
			pushMany(
				condensed,
				channel.messages.filter((m) => !condensedTypes.has(m.type || ""))
			);
		} else {
			const {entries, openContainer} = foldRun(channel.messages, channel.firstUnread);
			pushMany(condensed, entries);
			tailContainer = openContainer;
		}

		builtMode = mode;
		builtChannelId = channel.id;
	}

	// Rebuilds (and returns true) if the channel or folding mode changed
	// since the last build - the incremental paths below are only valid
	// when neither has moved out from under them.
	function invalidateIfStale(): boolean {
		const channel = getChannel();
		const mode = getMode(channel, getStatusMessages());

		if (mode !== builtMode || channel.id !== builtChannelId) {
			rebuildAll();
			return true;
		}

		return false;
	}

	// Call once for each message freshly pushed to the tail of
	// channel.messages (the common case: a single incoming `msg` event).
	function appendOne(message: ClientMessage) {
		if (invalidateIfStale()) {
			return;
		}

		if (builtMode === "raw") {
			condensed.push(message);
			return;
		}

		if (builtMode === "hidden") {
			if (!condensedTypes.has(message.type || "")) {
				condensed.push(message);
			}

			return;
		}

		// condensed mode
		const channel = getChannel();

		if (message.self || message.highlight || !condensedTypes.has(message.type || "")) {
			tailContainer = null;
			condensed.push(message);
			return;
		}

		if (!tailContainer) {
			tailContainer = {time: message.time, type: "condensed", messages: []};
			condensed.push(tailContainer);
		}

		tailContainer.messages.push(message);
		tailContainer.id = message.id;

		if (message.id === channel.firstUnread) {
			tailContainer = null;
		}
	}

	// Call once after `count` messages were unshifted onto the front of
	// channel.messages (more / messages:around / a lazy history load).
	function prependChunk(count: number) {
		if (invalidateIfStale()) {
			return;
		}

		if (count <= 0) {
			return;
		}

		const channel = getChannel();
		const prepended = channel.messages.slice(0, count);

		if (builtMode === "raw") {
			unshiftMany(condensed, prepended);
			return;
		}

		if (builtMode === "hidden") {
			unshiftMany(
				condensed,
				prepended.filter((m) => !condensedTypes.has(m.type || ""))
			);
			return;
		}

		// condensed mode: fold the new leading slice in isolation (folding
		// never looks ahead, so this matches what a full rebuild would
		// produce for this slice on its own), then merge its trailing edge
		// with the array's previous first entry if both are open condensed
		// containers - a full rebuild would have merged them into one
		// continuous container instead of two adjacent ones.
		const wasEmpty = condensed.length === 0;
		const {entries, openContainer} = foldRun(prepended, channel.firstUnread);
		const oldFirst = condensed[0];

		if (
			openContainer &&
			oldFirst &&
			typeof oldFirst === "object" &&
			oldFirst.type === "condensed"
		) {
			openContainer.messages.push(...oldFirst.messages);
			openContainer.id = oldFirst.id;
			condensed.splice(0, 1);
		}

		unshiftMany(condensed, entries);

		if (wasEmpty) {
			tailContainer = openContainer;
		}
	}

	rebuildAll();

	return {condensed, rebuildAll, appendOne, prependChunk};
}
