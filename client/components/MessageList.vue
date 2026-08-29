<template>
	<div ref="chat" class="chat" tabindex="-1">
		<div v-show="showLoadMoreButton" class="show-more">
			<button
				ref="loadMoreButton"
				:disabled="channel.historyLoading || !store.state.isConnected"
				class="btn"
				@click="onShowMoreClick"
			>
				<span v-if="channel.historyLoading">Loading…</span>
				<span v-else>Show older messages</span>
			</button>
		</div>
		<div
			class="messages"
			role="log"
			aria-live="polite"
			aria-relevant="additions"
			@copy="onCopy"
		>
			<template v-for="(message, idx) in displayedMessages" :key="getMessageKey(message)">
				<DateMarker
					v-if="shouldDisplayDateMarker(message, idx)"
					:message="message as any"
					:is-focused="isMessageFocused(message)"
				/>
				<div
					v-if="shouldDisplayUnreadMarker(Number(message.id))"
					class="unread-marker"
				>
					<span class="unread-marker-text" />
				</div>

				<MessageCondensed
					v-if="message.type === 'condensed'"
					:network="network"
					:keep-scroll-position="keepScrollPosition"
					:messages="message.messages"
					:is-focused="isMessageFocused(message)"
				/>
				<Message
					v-else
					:channel="channel"
					:network="network"
					:message="message"
					:keep-scroll-position="keepScrollPosition"
					:is-previous-source="isPreviousSource(message, idx)"
					:is-focused="isMessageFocused(message)"
					@toggle-link-preview="onLinkPreviewToggle"
				/>
			</template>
		</div>
	</div>
</template>

<script lang="ts">
import {condensedTypes} from "../../shared/irc";
import {ChanType} from "../../shared/types/chan";
import {MessageType, SharedMsg} from "../../shared/types/msg";
import eventbus from "../js/eventbus";
import clipboard from "../js/clipboard";
import socket from "../js/socket";
import Message from "./Message.vue";
import MessageCondensed from "./MessageCondensed.vue";
import DateMarker from "./DateMarker.vue";
import {
	computed,
	defineComponent,
	nextTick,
	onBeforeUnmount,
	onBeforeUpdate,
	onMounted,
	onUnmounted,
	PropType,
	ref,
	watch,
} from "vue";
import {useStore} from "../js/store";
import {ClientChan, ClientMessage, ClientNetwork, ClientLinkPreview} from "../js/types";

type CondensedMessageContainer = {
	type: "condensed";
	time: Date;
	messages: ClientMessage[];
	id?: number;
};

// TODO: move into component
let unreadMarkerShown = false;

// Render at most this many messages - keeps DOM manageable
const MAX_RENDERED_MESSAGES = 500;

export default defineComponent({
	name: "MessageList",
	components: {
		Message,
		MessageCondensed,
		DateMarker,
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
		isFocused: Number,
		focusedTime: Number,
	},
	setup(props) {
		const store = useStore();

		const chat = ref<HTMLDivElement | null>(null);
		const loadMoreButton = ref<HTMLButtonElement | null>(null);
		const historyObserver = ref<IntersectionObserver | null>(null);

		// The currently focused/highlighted message ID (primary) or time (fallback)
		const focusedMsgId = ref<number | null>(null);
		const focusedMsgTime = ref<number | null>(null);

		// Flag to prevent scroll handler during programmatic scrolls
		const isScrolling = ref(false);

		// Window start index for virtual scrolling - tracks which message index to start from
		const windowStartIndex = ref(0);

		// Track if we're currently adjusting the window (to prevent scroll handler interference)
		const isAdjustingWindow = ref(false);

		// Threshold for triggering window shifts (in pixels from edge)
		const SCROLL_THRESHOLD = 200;

		// Build condensed message list (all messages, before windowing)
		const allCondensedMessages = computed(() => {
			if (props.channel.type !== ChanType.CHANNEL && props.channel.type !== ChanType.QUERY) {
				return props.channel.messages;
			}

			if (store.state.settings.statusMessages === "hidden") {
				return props.channel.messages.filter(
					(message) => !condensedTypes.has(message.type || "")
				);
			}

			if (store.state.settings.statusMessages !== "condensed") {
				return props.channel.messages;
			}

			let lastCondensedContainer: CondensedMessageContainer | null = null;
			const condensed: (ClientMessage | CondensedMessageContainer)[] = [];

			for (const message of props.channel.messages) {
				if (message.self || message.highlight || !condensedTypes.has(message.type || "")) {
					lastCondensedContainer = null;
					condensed.push(message);
					continue;
				}

				if (!lastCondensedContainer) {
					lastCondensedContainer = {
						time: message.time,
						type: "condensed",
						messages: [],
					};
					condensed.push(lastCondensedContainer);
				}

				lastCondensedContainer.messages.push(message);
				lastCondensedContainer.id = message.id;

				if (message.id === props.channel.firstUnread) {
					lastCondensedContainer = null;
				}
			}

			return condensed.map((message) => {
				if (message.type === "condensed" && message.messages.length === 1) {
					return message.messages[0];
				}

				return message;
			});
		});

		// Windowed messages for rendering - show MAX_RENDERED_MESSAGES from windowStartIndex
		// This does NOT depend on scrolledToBottom to avoid reactivity issues
		const displayedMessages = computed(() => {
			const all = allCondensedMessages.value;
			const total = all.length;

			if (total <= MAX_RENDERED_MESSAGES) {
				return all;
			}

			// Use the window start index, clamped to valid range
			const start = Math.max(0, Math.min(windowStartIndex.value, total - MAX_RENDERED_MESSAGES));
			return all.slice(start, start + MAX_RENDERED_MESSAGES);
		});

		// Check if we can scroll further back in the window (not at start of all messages)
		const canScrollBack = computed(() => {
			return windowStartIndex.value > 0;
		});

		// Check if we're showing the latest messages
		const isAtEnd = computed(() => {
			const total = allCondensedMessages.value.length;
			return total <= MAX_RENDERED_MESSAGES ||
				windowStartIndex.value >= total - MAX_RENDERED_MESSAGES;
		});

		// Should we show the "load more" button?
		// Only show when at the start of all loaded messages AND server has more
		const showLoadMoreButton = computed(() => {
			return props.channel.moreHistoryAvailable && windowStartIndex.value === 0;
		});

		// Helper to get a unique key for each message
		const getMessageKey = (message: ClientMessage | CondensedMessageContainer) => {
			if (message.type === "condensed") {
				return `condensed-${message.messages[0]?.id}-${new Date(message.time).getTime()}`;
			}

			// Use time as part of key since IDs can be inconsistent
			return `${message.id}-${new Date(message.time).getTime()}`;
		};

		// Check if a message is focused (by ID first, then timestamp fallback)
		const isMessageFocused = (message: ClientMessage | CondensedMessageContainer): boolean => {
			// Check by ID first (preferred)
			if (focusedMsgId.value !== null) {
				if (message.type === "condensed") {
					return message.messages.some(inner => inner.id === focusedMsgId.value);
				}

				return message.id === focusedMsgId.value;
			}

			// Fallback to time-based matching
			if (!focusedMsgTime.value) return false;

			const msgTime = new Date(message.time).getTime();

			// Allow 1 second tolerance
			if (Math.abs(msgTime - focusedMsgTime.value) < 1000) {
				return true;
			}

			// Check inside condensed messages
			if (message.type === "condensed") {
				for (const inner of message.messages) {
					const innerTime = new Date(inner.time).getTime();

					if (Math.abs(innerTime - focusedMsgTime.value) < 1000) {
						return true;
					}
				}
			}

			return false;
		};

		// Scroll to bottom of the current DOM
		const scrollToBottom = () => {
			if (chat.value) {
				isScrolling.value = true;
				chat.value.scrollTop = chat.value.scrollHeight;

				// Reset after a short delay to allow the scroll event to fire
				setTimeout(() => {
					isScrolling.value = false;
				}, 50);
			}
		};

		// Jump to the absolute bottom (latest messages) and mark as at bottom
		const jumpToBottom = async () => {
			const total = allCondensedMessages.value.length;
			windowStartIndex.value = Math.max(0, total - MAX_RENDERED_MESSAGES);
			props.channel.scrolledToBottom = true;
			isAdjustingWindow.value = true;
			await nextTick();
			scrollToBottom();
			isAdjustingWindow.value = false;
		};

		// --- Scroll anchoring -------------------------------------------------
		// Capture a scroll anchor: the topmost message currently visible in the
		// viewport, identified by its stable id, plus its offset from the top of
		// the viewport (negative if that message is scrolled partway up). Used to
		// restore the exact scroll position after the render window shifts.
		const captureAnchor = (el: HTMLElement): {id: string | null, offset: number} => {
			const containerRect = el.getBoundingClientRect();
			const viewTop = containerRect.top;
			const viewBottom = viewTop + el.clientHeight;

			const msgEls = el.querySelectorAll<HTMLElement>(".msg");

			for (const m of msgEls) {
				const r = m.getBoundingClientRect();

				// First message whose bottom is below the viewport top (i.e., visible).
				if (r.bottom > viewTop + 0.5) {
					return {id: m.id ? m.id.replace(/^msg-/, "") : null, offset: r.top - viewTop};
				}

				if (r.top > viewBottom) {
					break; // rest of the list is past the viewport
				}
			}

			return {id: null, offset: 0};
		};

		// Restore the scroll position so the anchored message sits at the same
		// offset from the viewport top it had before the window shifted. Pinning to
		// a real element (by id) is exact regardless of variable row heights or how
		// many rows were added/removed at either edge of the render window. If the
		// anchor fell out of the window (a very large shift), pin the window's first
		// message to the viewport top as a stable approximation.
		const restoreAnchor = (el: HTMLElement, anchor: {id: string | null, offset: number}) => {
			let target: HTMLElement | null = null;

			if (anchor.id) {
				target = el.querySelector<HTMLElement>(`#msg-${anchor.id}`);
			}

			const containerRect = el.getBoundingClientRect();

			if (target) {
				const currentOffset = target.getBoundingClientRect().top - containerRect.top;
				const correction = currentOffset - anchor.offset;

				if (Math.abs(correction) > 0.5) {
					el.scrollTop = el.scrollTop + correction;
				}
			} else {
				const first = el.querySelector<HTMLElement>(".msg");

				if (first) {
					el.scrollTop = first.getBoundingClientRect().top - containerRect.top;
				}
			}
		};

		// Shift window up (show older messages) while preserving scroll position.
		// Anchor-based restoration (see captureAnchor/restoreAnchor) keeps the view
		// pinned exactly; the previous net-scrollHeight-delta approach drifted when
		// added and removed row heights didn't match, causing visible jumps.
		const shiftWindowUp = async (amount: number = 100) => {
			if (isAdjustingWindow.value || windowStartIndex.value <= 0) return;

			const el = chat.value;
			if (!el) return;

			isAdjustingWindow.value = true;
			const anchor = captureAnchor(el);

			// Shift window up
			const newStart = Math.max(0, windowStartIndex.value - amount);
			const actualShift = windowStartIndex.value - newStart;

			if (actualShift === 0) {
				isAdjustingWindow.value = false;
				return;
			}

			windowStartIndex.value = newStart;
			props.channel.scrolledToBottom = false;

			await nextTick();

			restoreAnchor(el, anchor);
			isAdjustingWindow.value = false;
		};

		// Shift window down (show newer messages) while preserving scroll position.
		// Anchor-based (see shiftWindowUp). Also fixes a latent bug: the previous
		// early-return for "already at maxStart" left isAdjustingWindow stuck true,
		// which permanently froze all scroll adjustment.
		const shiftWindowDown = async (amount: number = 100) => {
			if (isAdjustingWindow.value) return;

			const el = chat.value;
			if (!el) return;

			isAdjustingWindow.value = true;
			const anchor = captureAnchor(el);

			const total = allCondensedMessages.value.length;
			const maxStart = Math.max(0, total - MAX_RENDERED_MESSAGES);

			if (windowStartIndex.value >= maxStart) {
				isAdjustingWindow.value = false;
				return;
			}

			const newStart = Math.min(maxStart, windowStartIndex.value + amount);
			windowStartIndex.value = newStart;

			// Check if we're now at the end
			if (newStart >= maxStart) {
				props.channel.scrolledToBottom = true;
			}

			await nextTick();

			restoreAnchor(el, anchor);
			isAdjustingWindow.value = false;
		};

		// Find the index of the condensed entry containing a message id.
		const findIndexById = (all: (ClientMessage | CondensedMessageContainer)[], msgId: number): number => {
			for (let i = 0; i < all.length; i++) {
				const msg = all[i];

				if (msg.type === "condensed") {
					if (msg.messages.some((inner) => inner.id === msgId)) {
						return i;
					}
				} else if (msg.id === msgId) {
					return i;
				}
			}

			return -1;
		};

		// Find the index of the condensed entry containing a message by timestamp.
		const findIndexByTime = (all: (ClientMessage | CondensedMessageContainer)[], targetTime: number): number => {
			for (let i = 0; i < all.length; i++) {
				const msg = all[i];
				const msgTime = new Date(msg.time).getTime();

				if (Math.abs(msgTime - targetTime) < 1000) {
					return i;
				}

				if (msg.type === "condensed") {
					for (const inner of msg.messages) {
						if (Math.abs(new Date(inner.time).getTime() - targetTime) < 1000) {
							return i;
						}
					}
				}
			}

			return -1;
		};

		// Center the render window on the given index, then scroll the target
		// message (or the nearest one at that index) into view and highlight it.
		const performScrollTo = async (targetIndex: number) => {
			const all = allCondensedMessages.value;

			if (all.length > MAX_RENDERED_MESSAGES) {
				const halfWindow = Math.floor(MAX_RENDERED_MESSAGES / 2);
				windowStartIndex.value = Math.max(0, Math.min(targetIndex - halfWindow, all.length - MAX_RENDERED_MESSAGES));
			}

			await nextTick();

			const el = chat.value;

			if (!el) {
				isAdjustingWindow.value = false;
				return false;
			}

			const target = all[targetIndex];
			let node: HTMLElement | null = null;

			if (target) {
				const nodeId =
					target.type === "condensed"
						? `msg-${target.messages[0]?.id ?? ""}`
						: `msg-${target.id}`;
				node = el.querySelector<HTMLElement>(`#${nodeId}`);
			}

			if (!node) {
				// Fall back to the first rendered message in the window
				node = el.querySelector<HTMLElement>(".msg");
			}

			if (!node) {
				isAdjustingWindow.value = false;
				return false;
			}

			isScrolling.value = true;
			node.scrollIntoView({ behavior: "instant", block: "center" });

			// BUGBUG: prevent the chat window offset bugging when scrolling to
			// items near the bottom of the chat
			const container = el.closest("#chat-container");

			if (container) {
				container.scrollTop = 0;
			}

			setTimeout(() => {
				isScrolling.value = false;
				isAdjustingWindow.value = false;
			}, 50);

			// Clear highlight after a few seconds
			setTimeout(() => {
				focusedMsgId.value = null;
				focusedMsgTime.value = null;
			}, 3000);

			return true;
		};

		// Request a window of messages around a timestamp from the message
		// storage database (the server's "skip to chunk" primitive) and wait
		// for it to be merged into the channel. Resolves to the number of
		// messages the channel holds afterwards, so callers can detect whether
		// anything actually arrived.
		const fetchChunkAround = (time: number, timeoutMs = 4000): Promise<number> => {
			return new Promise((resolve) => {
				const channel = store.getters.findChannel(props.channel.id)?.channel;
				const baseline = channel ? channel.messages.length : 0;

				const handler = (data: {chan: number; messages: Array<{id?: number}>}) => {
					if (data.chan !== props.channel.id || !Array.isArray(data.messages)) {
						return;
					}

					const ch = store.getters.findChannel(props.channel.id)?.channel;
					resolve(ch ? ch.messages.length : baseline);
					socket.off("messages:around", handler);
				};

				socket.on("messages:around", handler);
				socket.emit("messages:around", {target: props.channel.id, time});

				// The server always answers (even with an empty chunk), so this
				// is purely a safety net against a lost response.
				setTimeout(() => {
					const ch = store.getters.findChannel(props.channel.id)?.channel;
					resolve(ch ? ch.messages.length : baseline);
					socket.off("messages:around", handler);
				}, timeoutMs);
			});
		};

		// Find and scroll to a message by ID. If the message is not in memory,
		// fetch the region of history around it from the database (skip to
		// chunk), merge it, and retry. If it still isn't there (no storage, or
		// the window missed it), highlight the nearest loaded message instead
		// of silently failing.
		const jumpToMessage = async (msgId: number, fallbackTime?: number): Promise<boolean> => {
			focusedMsgId.value = msgId;
			focusedMsgTime.value = fallbackTime || null;
			props.channel.scrolledToBottom = false;
			isAdjustingWindow.value = true;

			let targetIndex = findIndexById(allCondensedMessages.value, msgId);

			if (targetIndex === -1 && fallbackTime) {
				targetIndex = findIndexByTime(allCondensedMessages.value, fallbackTime);
			}

			// Not in memory: ask the database for the region around this
			// message, then look again.
			if (targetIndex === -1 && fallbackTime) {
				const before = props.channel.messages.length;
				await fetchChunkAround(fallbackTime);

				if (props.channel.messages.length !== before) {
					await nextTick();
					targetIndex = findIndexById(allCondensedMessages.value, msgId);
				}

				if (targetIndex === -1) {
					targetIndex = findIndexByTime(allCondensedMessages.value, fallbackTime);
				}
			}

			if (targetIndex === -1) {
				// Best effort: highlight the oldest loaded message, which is the
				// message closest in time to a target we could not load.
				const all = allCondensedMessages.value;

				if (all.length > 0 && fallbackTime) {
					let nearest = 0;
					let nearestDist = Infinity;

					for (let i = 0; i < all.length; i++) {
						const dist = Math.abs(new Date(all[i].time).getTime() - fallbackTime);

						if (dist < nearestDist) {
							nearestDist = dist;
							nearest = i;
						}
					}

					targetIndex = nearest;
				}
			}

			if (targetIndex === -1) {
				// Nothing loaded at all - nothing we can show.
				isAdjustingWindow.value = false;
				return false;
			}

			return await performScrollTo(targetIndex);
		};

		// Find and scroll to a message by timestamp (legacy fallback)
		const jumpToMessageByTime = async (timestamp: number): Promise<boolean> => {
			focusedMsgTime.value = timestamp;
			props.channel.scrolledToBottom = false;
			isAdjustingWindow.value = true;

			let targetIndex = findIndexByTime(allCondensedMessages.value, timestamp);

			// Not in memory: fetch the region of history around this time.
			if (targetIndex === -1) {
				const before = props.channel.messages.length;
				await fetchChunkAround(timestamp);

				if (props.channel.messages.length !== before) {
					await nextTick();
					targetIndex = findIndexByTime(allCondensedMessages.value, timestamp);
				}
			}

			if (targetIndex === -1) {
				// Best effort: highlight the nearest loaded message in time.
				const all = allCondensedMessages.value;

				if (all.length === 0) {
					isAdjustingWindow.value = false;
					return false;
				}

				let nearest = 0;
				let nearestDist = Infinity;

				for (let i = 0; i < all.length; i++) {
					const dist = Math.abs(new Date(all[i].time).getTime() - timestamp);

					if (dist < nearestDist) {
						nearestDist = dist;
						nearest = i;
					}
				}

				targetIndex = nearest;
			}

			return await performScrollTo(targetIndex);
		};

		// Handle scroll events - triggers window shifting when near edges
		const handleScroll = () => {
			// Skip if we're doing a programmatic scroll or adjusting the window
			if (isScrolling.value || isAdjustingWindow.value) {
				return;
			}

			const el = chat.value;
			if (!el) return;

			const scrollTop = el.scrollTop;
			const scrollHeight = el.scrollHeight;
			const clientHeight = el.clientHeight;
			const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
			const distanceFromTop = scrollTop;

			// Update scrolledToBottom state - only when actually at the DOM bottom AND at end of messages
			const atDOMBottom = distanceFromBottom <= 30;

			if (atDOMBottom && isAtEnd.value) {
				if (!props.channel.scrolledToBottom) {
					props.channel.scrolledToBottom = true;
				}
			} else if (props.channel.scrolledToBottom && distanceFromBottom > 100) {
				// Only unset if user scrolled significantly away from bottom
				props.channel.scrolledToBottom = false;
			}

			// Dynamic window shifting - shift when user scrolls near edges.
			// The shift amount scales with how deep into the edge zone we are, so a
			// fast scroll covers more history per render tick instead of a fixed
			// 50 rows (which made catching up to a fast scroll take many ticks).
			if (distanceFromTop < SCROLL_THRESHOLD && canScrollBack.value) {
				const depth = Math.max(0, SCROLL_THRESHOLD - distanceFromTop);
				const amount = Math.min(300, Math.max(50, Math.round(depth * 4)));
				void shiftWindowUp(amount);
			}
			// Shift down (load newer) when near bottom but not at end
			else if (distanceFromBottom < SCROLL_THRESHOLD && !isAtEnd.value) {
				const depth = Math.max(0, SCROLL_THRESHOLD - distanceFromBottom);
				const amount = Math.min(300, Math.max(50, Math.round(depth * 4)));
				void shiftWindowDown(amount);
			}
		};

		// Load more from server
		const onShowMoreClick = () => {
			if (!store.state.isConnected) return;

			let lastMessage = -1;

			for (const message of props.channel.messages) {
				if (!message.showInActive) {
					lastMessage = message.id;
					break;
				}
			}

			// Anchor the request to the oldest message we hold so that when the
			// in-memory buffer runs out, the server can skip straight to the
			// next region of history in the database instead of stalling
			const messages = props.channel.messages;
			const beforeTime = messages.length > 0 ? new Date(messages[0].time).getTime() : undefined;

			props.channel.historyLoading = true;
			socket.emit("more", {
				target: props.channel.id,
				lastId: lastMessage,
				condensed: store.state.settings.statusMessages !== "shown",
				beforeTime,
			});
		};

		const shouldDisplayDateMarker = (
			message: SharedMsg | CondensedMessageContainer,
			idx: number
		) => {
			const previousMessage = displayedMessages.value[idx - 1];

			if (!previousMessage) return true;

			const oldDate = new Date(previousMessage.time);
			const newDate = new Date(message.time);

			return (
				oldDate.getDate() !== newDate.getDate() ||
				oldDate.getMonth() !== newDate.getMonth() ||
				oldDate.getFullYear() !== newDate.getFullYear()
			);
		};

		const shouldDisplayUnreadMarker = (id: number) => {
			if (!unreadMarkerShown && id > props.channel.firstUnread) {
				unreadMarkerShown = true;
				return true;
			}

			return false;
		};

		const isPreviousSource = (currentMessage: ClientMessage, idx: number) => {
			const previousMessage = displayedMessages.value[idx - 1];
			return (
				previousMessage &&
				currentMessage.type === MessageType.MESSAGE &&
				previousMessage.type === MessageType.MESSAGE &&
				currentMessage.from &&
				previousMessage.from &&
				currentMessage.from.nick === previousMessage.from.nick
			);
		};

		const onCopy = () => {
			if (chat.value) {
				clipboard(chat.value);
			}
		};

		const keepScrollPosition = async () => {
			if (props.channel.scrolledToBottom) {
				await jumpToBottom();
				return;
			}

			const el = chat.value;
			if (!el) return;

			// Maintain relative scroll position
			isAdjustingWindow.value = true;
			const scrollBottom = el.scrollHeight - el.scrollTop;
			await nextTick();
			isScrolling.value = true;
			el.scrollTop = el.scrollHeight - scrollBottom;
			setTimeout(() => {
				isScrolling.value = false;
				isAdjustingWindow.value = false;
			}, 50);
		};

		const onLinkPreviewToggle = async (preview: ClientLinkPreview, message: ClientMessage) => {
			await keepScrollPosition();
			socket.emit("msg:preview:toggle", {
				target: props.channel.id,
				msgId: message.id,
				link: preview.link,
				shown: preview.shown,
			});
		};

		const handleResize = () => {
			if (props.channel.scrolledToBottom) {
				void jumpToBottom();
			}
		};

		// Initialize
		onMounted(async () => {
			chat.value?.addEventListener("scroll", handleScroll, { passive: true });
			eventbus.on("resize", handleResize);

			// Handle initial focus from search - try ID first, then time fallback
			if (props.isFocused && !isNaN(props.isFocused)) {
				await nextTick();
				await jumpToMessage(props.isFocused, props.focusedTime);
			} else if (props.focusedTime && !isNaN(props.focusedTime)) {
				await nextTick();
				await jumpToMessageByTime(props.focusedTime);
			} else {
				// Default: scroll to bottom
				props.channel.scrolledToBottom = true;
				windowStartIndex.value = Math.max(0, allCondensedMessages.value.length - MAX_RENDERED_MESSAGES);
				await nextTick();
				scrollToBottom();
			}

			// Set up intersection observer for auto-loading history
			await nextTick();

			if (window.IntersectionObserver && loadMoreButton.value) {
				historyObserver.value = new IntersectionObserver(
					(entries) => {
						entries.forEach((entry) => {
							if (entry.isIntersecting) {
								onShowMoreClick();
							}
						});
					},
					{ root: chat.value }
				);
				historyObserver.value.observe(loadMoreButton.value);
			}
		});

		// Channel switch - scroll to bottom and reset window
		watch(
			() => props.channel.id,
			async () => {
				props.channel.scrolledToBottom = true;
				focusedMsgId.value = null;
				focusedMsgTime.value = null;
				windowStartIndex.value = Math.max(0, allCondensedMessages.value.length - MAX_RENDERED_MESSAGES);
				await nextTick();
				scrollToBottom();

				if (historyObserver.value && loadMoreButton.value) {
					historyObserver.value.unobserve(loadMoreButton.value);
					historyObserver.value.observe(loadMoreButton.value);
				}
			}
		);

		// Track the first message ID to detect when history is loaded
		const firstMessageId = computed(() => {
			const msgs = props.channel.messages;
			return msgs.length > 0 ? msgs[0].id : null;
		});

		// When history is loaded (messages prepended), adjust window to maintain position
		watch(
			firstMessageId,
			async (newFirstId, oldFirstId) => {
				if (oldFirstId === null || newFirstId === null) return;
				if (newFirstId === oldFirstId) return;

				// A history chunk was prepended (`more` or `messages:around`).
				// Remap the render window so the region the user was reading
				// stays exactly where it was. If we were at the top of the
				// loaded history, keep the window at 0 so the freshly loaded
				// chunk is visible.
				const el = chat.value;
				if (!el) return;

				isAdjustingWindow.value = true;
				const oldScrollTop = el.scrollTop;
				const oldScrollHeight = el.scrollHeight;
				const oldStart = windowStartIndex.value;
				const wasAtStart = oldStart === 0;

				await nextTick();

				if (!wasAtStart) {
					// How many condensed entries were prepended: the old first
					// message (identified by its stable id) now sits at that
					// index in the re-ordered list.
					const prepended = findIndexById(allCondensedMessages.value, oldFirstId);

					if (prepended > 0) {
						// Shift the window start by the number of prepended
						// entries so the same messages remain rendered.
						const maxStart = Math.max(0, allCondensedMessages.value.length - MAX_RENDERED_MESSAGES);
						windowStartIndex.value = Math.min(maxStart, oldStart + prepended);

						await nextTick();
					}
				}

				// Restore scroll position. For a prepend, everything the user
				// was looking at moved down by exactly the height of the new
				// rows, so a scroll-height delta is pixel-accurate.
				const heightDiff = el.scrollHeight - oldScrollHeight;
				isScrolling.value = true;
				el.scrollTop = oldScrollTop + heightDiff;

				setTimeout(() => {
					isScrolling.value = false;
					isAdjustingWindow.value = false;
				}, 50);
			}
		);

		// New messages at the end - stay at bottom if we were at bottom
		watch(
			() => props.channel.messages.length,
			async (newLen, oldLen) => {
				if (props.channel.scrolledToBottom) {
					// Keep window at the end when new messages come in
					const total = allCondensedMessages.value.length;
					windowStartIndex.value = Math.max(0, total - MAX_RENDERED_MESSAGES);
					await nextTick();
					scrollToBottom();
				} else if (oldLen !== undefined && newLen > oldLen) {
					// Messages were added (likely at the end) but we're not at bottom
					// Don't change window or scroll - user is reading history
				}
			}
		);

		// Handle focused message ID (from search results - primary)
		watch(
			() => props.isFocused,
			async (focused) => {
				if (!focused || isNaN(focused)) return;
				await nextTick();
				await jumpToMessage(focused, props.focusedTime);
			}
		);

		// Handle focused time (from search results - fallback for old messages)
		watch(
			() => props.focusedTime,
			async (focusedTime) => {
				// Only use time if no ID was provided
				if (props.isFocused && !isNaN(props.isFocused)) return;
				if (!focusedTime || isNaN(focusedTime)) return;
				await nextTick();
				await jumpToMessageByTime(focusedTime);
			}
		);

		onBeforeUpdate(() => {
			unreadMarkerShown = false;
		});

		onBeforeUnmount(() => {
			eventbus.off("resize", handleResize);
			chat.value?.removeEventListener("scroll", handleScroll);
		});

		onUnmounted(() => {
			historyObserver.value?.disconnect();
		});

		return {
			chat,
			store,
			loadMoreButton,
			displayedMessages,
			showLoadMoreButton,
			getMessageKey,
			isMessageFocused,
			onShowMoreClick,
			onCopy,
			shouldDisplayDateMarker,
			shouldDisplayUnreadMarker,
			keepScrollPosition,
			isPreviousSource,
			jumpToBottom,
			onLinkPreviewToggle,
		};
	},
});
</script>
