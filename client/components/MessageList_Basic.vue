<template>
	<div ref="chat" class="chat" tabindex="-1">
		<div v-show="channel.moreHistoryAvailable" class="show-more">
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
			:style="{
				position: 'relative',
				height: totalSize + 'px',
				padding: 0,
			}"
			@copy="onCopy"
		>
			<div
				v-for="virtualRow in virtualItems"
				:key="virtualRow.key"
				:ref="(el) => rowVirtualizer.measureElement(el as Element)"
				:data-index="virtualRow.index"
				:style="{
					position: 'absolute',
					top: 0,
					left: 0,
					width: '100%',
					transform: `translateY(${virtualRow.start + MESSAGES_PADDING}px)`,
					padding: '0 0 ' + (virtualRow.index === condensedMessages.length - 1 ? MESSAGES_PADDING : 0) + 'px',
				}"
			>
				<DateMarker
					v-if="shouldDisplayDateMarker(entryAt(virtualRow.index), virtualRow.index)"
					:message="(entryAt(virtualRow.index) as any)"
					:focused="entryAt(virtualRow.index).id === focused"
				/>
				<div
					v-if="shouldDisplayUnreadMarker(virtualRow.index)"
					class="unread-marker"
				>
					<span class="unread-marker-text" />
				</div>

				<MessageCondensed
					v-if="condensedGroupAt(virtualRow.index)"
					:network="network"
					:keep-scroll-position="keepScrollPosition"
					:messages="condensedGroupAt(virtualRow.index)!.messages"
					:focused="entryAt(virtualRow.index).id === focused"
				/>
				<Message
					v-else
					:channel="channel"
					:network="network"
					:message="messageAt(virtualRow.index)"
					:keep-scroll-position="keepScrollPosition"
					:is-previous-source="isPreviousSource(entryAt(virtualRow.index), virtualRow.index)"
					:focused="entryAt(virtualRow.index).id === focused"
					@toggle-link-preview="onLinkPreviewToggle"
				/>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import {MessageType, SharedMsg} from "../../shared/types/msg";
import eventbus from "../js/eventbus";
import clipboard from "../js/clipboard";
import socket from "../js/socket";
import Message from "./Message.vue";
import MessageCondensed from "./MessageCondensed.vue";
import DateMarker from "./DateMarker.vue";
import {computed, defineComponent, nextTick, onBeforeUnmount, onMounted, onUnmounted, PropType, ref, watch} from "vue";
import {useVirtualizer} from "@tanstack/vue-virtual";
import {useStore} from "../js/store";
import {ClientChan, ClientMessage, ClientNetwork, ClientLinkPreview} from "../js/types";
import {
	useCondensedMessages,
	CondensedEntry,
	CondensedMessageContainer,
} from "../js/hooks/use-condensed-messages";

// Matches the previous (unvirtualized) `#chat .messages { padding: 10px 0; }`
// rule - absolutely-positioned rows don't respect that CSS padding (it
// applies to the containing block's padding edge, which is where `top: 0`
// starts from), so the equivalent inset is baked into row offsets/height here.
const MESSAGES_PADDING = 10;

export default defineComponent({
	name: "MessageListBasic",
	components: {
		Message,
		MessageCondensed,
		DateMarker,
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
		focused: Number,
	},
	setup(props) {
		const store = useStore();

		const chat = ref<HTMLDivElement | null>(null);
		const loadMoreButton = ref<HTMLButtonElement | null>(null);
		const historyObserver = ref<IntersectionObserver | null>(null);
		const skipNextScrollEvent = ref(false);

		const isWaitingForNextTick = ref(false);

		// Maintains the condensed (status-message-folding) view
		// incrementally instead of rebuilding it from scratch on every
		// incoming message - see use-condensed-messages.ts.
		const {
			condensed: condensedMessages,
			rebuildAll: rebuildCondensed,
			appendOne: appendCondensed,
			prependChunk: prependCondensed,
		} = useCondensedMessages(
			() => props.channel,
			() => store.state.settings.statusMessages
		);

		const entryAt = (index: number) => condensedMessages[index];

		const condensedGroupAt = (index: number): CondensedMessageContainer | null => {
			const entry = condensedMessages[index];
			return entry.type === "condensed" && entry.messages.length > 1 ? entry : null;
		};

		const messageAt = (index: number): ClientMessage => {
			const entry = condensedMessages[index];
			return entry.type === "condensed" ? entry.messages[0] : entry;
		};

		// Every message in a channel's history used to be a real mounted DOM
		// node with no windowing, which froze the UI on large (maxHistory: -1)
		// channels. This renders only the rows near the viewport; heights vary
		// a lot (plain messages, async-loading link previews, collapsible
		// condensed groups) so sizes start as a rough estimate and are
		// corrected per-row by measureElement's ResizeObserver after mount.
		const getEntryKey = (entry: CondensedEntry): number =>
			entry.type === "condensed" && entry.messages.length > 1
				? entry.messages[0].id
				: (entry.id as number);

		// The whole options object must be wrapped in `computed()` (rather
		// than passed as a plain object with `condensedMessages.length` read
		// once at setup time) so @tanstack/vue-virtual re-subscribes whenever
		// condensedMessages actually changes length - see its own
		// `computed(() => ({...unref(options)}))` wrapping internally, which
		// only re-runs when its own dependency (this computed) changes.
		const rowVirtualizer = useVirtualizer(
			computed(() => ({
				count: condensedMessages.length,
				getScrollElement: () => chat.value,
				estimateSize: () => 28,
				overscan: 8,
				getItemKey: (index: number) => getEntryKey(condensedMessages[index]),
			}))
		);

		const virtualItems = computed(() => rowVirtualizer.value.getVirtualItems());
		const totalSize = computed(() => rowVirtualizer.value.getTotalSize() + MESSAGES_PADDING);

		const jumpToBottom = () => {
			skipNextScrollEvent.value = true;
			props.channel.scrolledToBottom = true;

			if (condensedMessages.length > 0) {
				rowVirtualizer.value.scrollToIndex(condensedMessages.length - 1, {align: "end"});
			}
		};

		const onShowMoreClick = () => {
			if (!store.state.isConnected) {
				return;
			}

			let lastMessage = -1;

			// Find the id of first message that isn't showInActive
			// If showInActive is set, this message is actually in another channel
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

		const onLoadButtonObserved = (entries: IntersectionObserverEntry[]) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) {
					return;
				}

				onShowMoreClick();
			});
		};

		nextTick(() => {
			if (!chat.value) {
				return;
			}

			if (window.IntersectionObserver) {
				historyObserver.value = new window.IntersectionObserver(onLoadButtonObserved, {
					root: chat.value,
				});
			}

			jumpToBottom();
		}).catch((e) => {
			// eslint-disable-next-line no-console
			console.error("Error in new IntersectionObserver", e);
		});

		// Manually tracked (not reactive) - lets the messages-length watcher
		// below classify what kind of change happened (prepend vs append vs
		// a shrink) without needing a second watcher and its ordering.
		let prevFirstId: number | null =
			props.channel.messages.length > 0 ? props.channel.messages[0].id : null;

		const shouldDisplayDateMarker = (message: SharedMsg | CondensedEntry, id: number) => {
			const previousMessage = condensedMessages[id - 1];

			if (!previousMessage) {
				return true;
			}

			const oldDate = new Date(previousMessage.time);
			const newDate = new Date(message.time);

			return (
				oldDate.getDate() !== newDate.getDate() ||
				oldDate.getMonth() !== newDate.getMonth() ||
				oldDate.getFullYear() !== newDate.getFullYear()
			);
		};

		const highestIdAt = (entry: CondensedEntry): number =>
			entry.type === "condensed"
				? entry.id ?? entry.messages[entry.messages.length - 1].id
				: entry.id;

		// Shows the unread marker exactly once, on the first entry (in array
		// order) whose highest contained message id crosses past firstUnread.
		// Index-independent (only ever looks at condensedMessages[index] and
		// condensedMessages[index - 1]) so it works under partial/out-of-order
		// virtualized rendering, unlike the old version's shared mutable
		// "already shown this pass" flag, which assumed a full top-to-bottom
		// render every update.
		const shouldDisplayUnreadMarker = (index: number) => {
			const entry = condensedMessages[index];

			if (!entry || highestIdAt(entry) <= props.channel.firstUnread) {
				return false;
			}

			const previous = condensedMessages[index - 1];

			return !previous || highestIdAt(previous) <= props.channel.firstUnread;
		};

		const isPreviousSource = (currentMessage: CondensedEntry, id: number) => {
			const previousMessage = condensedMessages[id - 1];
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
			// If we are already waiting for the next tick to force scroll position,
			// we have no reason to perform more checks and set it again in the next tick
			if (isWaitingForNextTick.value) {
				return;
			}

			const el = chat.value;

			if (!el) {
				return;
			}

			if (!props.channel.scrolledToBottom) {
				// No manual restore needed here for a prepend (loading older
				// history while scrolled up): the virtualizer already keeps the
				// viewport visually stable as newly-prepended rows above the
				// fold get measured for the first time (see
				// @tanstack/virtual-core's built-in scroll-adjustment-on-resize
				// logic) - a second, manual restore on top of that fought with
				// it and was the actual cause of the scrollbar visibly jumping
				// back and forth as rows settled from their estimated size to
				// their real one.
				return;
			}

			isWaitingForNextTick.value = true;
			await nextTick();
			isWaitingForNextTick.value = false;

			jumpToBottom();
		};

		const onLinkPreviewToggle = async (preview: ClientLinkPreview, message: ClientMessage) => {
			await keepScrollPosition();

			// Tell the server we're toggling so it remembers at page reload
			socket.emit("msg:preview:toggle", {
				target: props.channel.id,
				msgId: message.id,
				link: preview.link,
				shown: preview.shown,
			});
		};

		const handleScroll = () => {
			// Setting scrollTop also triggers scroll event
			// We don't want to perform calculations for that
			if (skipNextScrollEvent.value) {
				skipNextScrollEvent.value = false;
				return;
			}

			const el = chat.value;

			if (!el) {
				return;
			}

			props.channel.scrolledToBottom = el.scrollHeight - el.scrollTop - el.offsetHeight <= 30;
		};

		const handleResize = () => {
			// Keep message list scrolled to bottom on resize
			if (props.channel.scrolledToBottom) {
				jumpToBottom();
			}
		};

		onMounted(() => {
			chat.value?.addEventListener("scroll", handleScroll, {passive: true});

			eventbus.on("resize", handleResize);

			void nextTick(() => {
				if (historyObserver.value && loadMoreButton.value) {
					historyObserver.value.observe(loadMoreButton.value);
				}
			});
		});

		watch(
			() => props.channel.id,
			() => {
				props.channel.scrolledToBottom = true;

				// Switching channels swaps in a whole different messages
				// array - rebuild the condensed view for it outright rather
				// than trying to classify this as a prepend/append.
				rebuildCondensed();
				prevFirstId =
					props.channel.messages.length > 0 ? props.channel.messages[0].id : null;

				// The virtualizer's measurement cache is keyed by message id,
				// which is only unique within a channel - clear it so the new
				// channel's rows don't briefly render at a previous channel's
				// (possibly numerically colliding) cached heights.
				rowVirtualizer.value.measure();

				// Re-add the intersection observer to trigger the check again on channel switch
				// Otherwise if last channel had the button visible, switching to a new channel won't trigger the history
				if (historyObserver.value && loadMoreButton.value) {
					historyObserver.value.unobserve(loadMoreButton.value);
					historyObserver.value.observe(loadMoreButton.value);
				}
			}
		);

		// Replaces a `deep: true` watch over the whole messages array (which
		// deep-traverses every message's object graph on every single
		// incoming message - expensive, and the actual cause of most
		// chat-while-scrolling lag under default settings). A shallow watch
		// on `.length` plus comparing the first message's id is enough to
		// tell a tail-append from a head-prepend from a shrink (client-side
		// history trimming), and drives the condensed view incrementally.
		watch(
			() => props.channel.messages.length,
			async (newLen, oldLen) => {
				const messages = props.channel.messages;
				const newFirstId = messages.length > 0 ? messages[0].id : null;
				const isPrepend =
					oldLen !== undefined &&
					newLen > oldLen &&
					prevFirstId !== null &&
					newFirstId !== prevFirstId;
				const isAppend = oldLen !== undefined && newLen > oldLen && !isPrepend;

				if (isAppend) {
					const addedCount = newLen - (oldLen ?? 0);

					if (addedCount === 1) {
						appendCondensed(messages[messages.length - 1]);
					} else if (addedCount > 0 && addedCount <= 20) {
						for (let i = messages.length - addedCount; i < messages.length; i++) {
							appendCondensed(messages[i]);
						}
					} else {
						rebuildCondensed();
					}
				} else if (isPrepend) {
					prependCondensed(newLen - (oldLen ?? 0));
				} else {
					// Shrink (client-side trim once over the message cap in
					// msg.ts) or anything else ambiguous - safe, infrequent
					// fallback.
					rebuildCondensed();
				}

				prevFirstId = newFirstId;

				await keepScrollPosition();
			}
		);

		watch(
			() => props.channel.pendingMessage,
			async () => {
				// Keep the scroll stuck when input gets resized while typing
				await keepScrollPosition();
			}
		);

		onBeforeUnmount(() => {
			eventbus.off("resize", handleResize);
			chat.value?.removeEventListener("scroll", handleScroll);
		});

		onUnmounted(() => {
			if (historyObserver.value) {
				historyObserver.value.disconnect();
			}
		});

		return {
			chat,
			store,
			onShowMoreClick,
			loadMoreButton,
			onCopy,
			condensedMessages,
			entryAt,
			condensedGroupAt,
			messageAt,
			rowVirtualizer,
			virtualItems,
			totalSize,
			MESSAGES_PADDING,
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
