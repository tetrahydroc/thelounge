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
			@copy="onCopy"
		>
			<template v-for="(message, id) in condensedMessages">
				<DateMarker
					v-if="shouldDisplayDateMarker(message, id)"
					:key="message.id + '-date'"
					:message="(message as any)"
					:focused="message.id === focused"
				/>
				<div
					v-if="shouldDisplayUnreadMarker(Number(message.id))"
					:key="message.id + '-unread'"
					class="unread-marker"
				>
					<span class="unread-marker-text" />
				</div>

				<MessageCondensed
					v-if="message.type === 'condensed' && message.messages.length > 1"
					:key="message.messages[0].id"
					:network="network"
					:keep-scroll-position="keepScrollPosition"
					:messages="message.messages"
					:focused="message.id === focused"
				/>
				<Message
					v-else
					:key="message.id"
					:channel="channel"
					:network="network"
					:message="message.type === 'condensed' ? message.messages[0] : message"
					:keep-scroll-position="keepScrollPosition"
					:is-previous-source="isPreviousSource(message, id)"
					:focused="message.id === focused"
					@toggle-link-preview="onLinkPreviewToggle"
				/>
			</template>
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
import {
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
import {useCondensedMessages, CondensedEntry} from "../js/hooks/use-condensed-messages";

// TODO; move into component
let unreadMarkerShown = false;

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

		const jumpToBottom = () => {
			skipNextScrollEvent.value = true;
			props.channel.scrolledToBottom = true;

			const el = chat.value;

			if (el) {
				el.scrollTop = el.scrollHeight;
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

		const shouldDisplayUnreadMarker = (id: number) => {
			if (!unreadMarkerShown && id > props.channel.firstUnread) {
				unreadMarkerShown = true;
				return true;
			}

			return false;
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
				if (props.channel.historyLoading) {
					const heightOld = el.scrollHeight - el.scrollTop;

					isWaitingForNextTick.value = true;

					await nextTick();

					isWaitingForNextTick.value = false;
					skipNextScrollEvent.value = true;

					el.scrollTop = el.scrollHeight - heightOld;
				}

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

		onBeforeUpdate(() => {
			unreadMarkerShown = false;
		});

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
