import {markRaw, reactive} from "vue";
import {ClientChan, ClientMessage} from "./types";
import {SharedNetworkChan} from "../../shared/types/network";
import {SharedMsg, MessageType} from "../../shared/types/msg";
import {ChanType} from "../../shared/types/chan";

// Messages are effectively immutable once created - the one exception is
// `previews`, which is genuinely mutated in place after insertion (shown/
// hidden toggling in LinkPreviewToggle.vue and the /expand, /collapse
// commands; load-state fields like `thumb`/`sourceLoaded` in
// LinkPreview.vue) and needs to stay reactive for those to keep working.
// `markRaw` stops Vue from auto-wrapping *anything* nested under a message,
// so `previews` has to be wrapped explicitly, before the message itself is
// marked raw - only the immutable rest of the message (from/text/target/
// etc.) opts out of Vue's deep-reactivity Proxy wrapping, which is pure
// overhead for fields that never change. Apply this at every point a
// message enters a channel's `messages` array.
export function markMsgRaw<T extends SharedMsg>(msg: T): T {
	if (msg.previews) {
		msg.previews = reactive(msg.previews) as typeof msg.previews;
	}

	return markRaw(msg);
}

export function markMsgsRaw<T extends SharedMsg>(msgs: T[]): T[] {
	return msgs.map(markMsgRaw);
}

// `target.unshift(...items)` (or any spread into a function call) blows the
// call stack once `items` gets large enough - each JS engine caps how many
// arguments a single call can take (V8 throws "Maximum call stack size
// exceeded" somewhere in the tens-of-thousands), and a channel loaded with
// `maxHistory: -1` can hand back a single history batch well past that.
// Prepending in bounded chunks via splice keeps the same array reference
// (required for reactive arrays like a channel's `messages` or the
// condensed-message view, where callers hold onto that exact object) while
// never spreading more than a small, fixed number of arguments at once.
const PREPEND_CHUNK_SIZE = 1000;

export function unshiftMany<T>(target: T[], items: T[]): void {
	for (let end = items.length; end > 0; end -= PREPEND_CHUNK_SIZE) {
		const start = Math.max(0, end - PREPEND_CHUNK_SIZE);
		target.splice(0, 0, ...items.slice(start, end));
	}
}

// Same reasoning as unshiftMany, for the tail end - `target.push(...items)`
// with a large `items` (a full rebuild of the condensed view against a
// channel with a huge in-memory history, e.g. maxHistory: -1) hits the same
// call-stack limit.
export function pushMany<T>(target: T[], items: T[]): void {
	for (let start = 0; start < items.length; start += PREPEND_CHUNK_SIZE) {
		target.push(...items.slice(start, start + PREPEND_CHUNK_SIZE));
	}
}

export function toClientChan(shared: SharedNetworkChan): ClientChan {
	const history: string[] = [""].concat(
		shared.messages
			.filter((m) => m.self && m.text && m.type === MessageType.MESSAGE)
			// TS is too stupid to see the nil guard on filter... so we monkey patch it
			.map((m): string => (m.text ? m.text : ""))
			.reverse()
			.slice(0, 99)
	);
	// filter the unused vars
	const {messages, ...props} = shared;
	const channel: ClientChan = {
		...props,
		editTopic: false,
		pendingMessage: "",
		inputHistoryPosition: 0,
		historyLoading: false,
		scrolledToBottom: true,
		users: [],
		usersOutdated: shared.type === ChanType.CHANNEL ? true : false,
		// The server now loads a channel's history lazily (on first open)
		// rather than eagerly for every channel at connect. Until it reports
		// back that it has actually loaded this channel (via the `more`
		// event `loadMessages()` sends once its fetch resolves), assume more
		// history may exist so "Show older messages" / infinite-scroll-up
		// stay available instead of looking like a channel with no history.
		moreHistoryAvailable:
			!shared.historyLoaded || shared.totalMessages > shared.messages.length,
		inputHistory: history,
		messages: sharedMsgToClientMsg(messages),
		// Initialize groups for reactivity (will be populated by SPGROUPS)
		groups: shared.groups || undefined,
	};
	return channel;
}

function sharedMsgToClientMsg(shared: SharedMsg[]): ClientMessage[] {
	// TODO: this is a stub for now, we will want to populate client specific stuff here
	return markMsgsRaw(shared);
}
