<template>
	<div id="chat-container" class="window">
		<div
			id="chat"
			:class="{
				'time-seconds': store.state.settings.showSeconds,
				'time-12h': store.state.settings.use12hClock,
			}"
		>
			<div
				class="chat-view"
				data-type="search-results"
				aria-label="Search results"
				role="tabpanel"
			>
				<div v-if="network && channel" class="header">
					<SidebarToggle />
					<span class="title"
						>Searching in <span class="channel-name">{{ channel.name }}</span> for</span
					>
					<span class="topic">{{ route.query.q }}</span>
					<input
						type="date"
						class="search-date-jump"
						title="Jump to date"
						aria-label="Jump to date"
						@change="jumpToDate"
					/>
					<MessageSearchForm :network="network" :channel="channel" />
					<button
						class="close"
						aria-label="Close search window"
						title="Close search window"
						@click="closeSearch"
					/>
				</div>
				<div v-if="network && channel" class="chat-content">
					<div ref="chat" class="chat" tabindex="-1">
						<div v-show="moreResultsAvailable" class="show-more">
							<button
								ref="loadMoreButton"
								:disabled="
									!!store.state.messageSearchPendingQuery ||
									!store.state.isConnected
								"
								class="btn"
								@click="onShowMoreClick"
							>
								<span v-if="store.state.messageSearchPendingQuery">Loading…</span>
								<span v-else>Show older messages</span>
							</button>
						</div>

						<div
							v-if="store.state.messageSearchPendingQuery && !offset"
							class="search-status"
						>
							Searching…
						</div>
						<div v-else-if="!messages.length && !offset" class="search-status">
							No results found.
						</div>
						<div
							class="messages"
							role="log"
							aria-live="polite"
							aria-relevant="additions"
						>
							<div
								v-for="(message, id) in messages"
								:key="message.id"
								class="result"
								:data-jump-to="store.state.settings.enableEnhancedSearch || undefined"
							>
								<DateMarker
									v-if="shouldDisplayDateMarker(message, id)"
									:key="message.id + '-date'"
									:message="message"
								/>
								<Message
									:key="message.id"
									:channel="channel"
									:network="network"
									:message="message"
									:data-id="message.id"
									@click="jump(message)"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style>
.channel-name {
	font-weight: 700;
}

.result[data-jump-to] > .msg {
	cursor: pointer;

	&:hover {
		background-color: var(--highlight-bg-color) !important;
	}
}

.chat-view[data-type="search-results"] .chat-content {
	margin-top: 45px;
}
</style>

<script lang="ts">
import socket from "../../js/socket";
import eventbus from "../../js/eventbus";

import SidebarToggle from "../SidebarToggle.vue";
import Message from "../Message.vue";
import MessageSearchForm from "../MessageSearchForm.vue";
import DateMarker from "../DateMarker.vue";
import {watch, computed, defineComponent, nextTick, ref, onMounted, onUnmounted} from "vue";
import type {ClientMessage} from "../../js/types";

import {useStore} from "../../js/store";
import {useRoute, useRouter} from "vue-router";
import {switchToChannel} from "../../js/router";
import {SearchQuery} from "../../../shared/types/storage";

// Matches datebefore:/dateafter: tokens the date-jump picker manages, so
// selecting a new date replaces any previous one instead of stacking up.
const DATE_TOKEN_RE = /\b(?:datebefore|dateafter):\S+/gi;

export default defineComponent({
	name: "SearchResults",
	components: {
		SidebarToggle,
		Message,
		DateMarker,
		MessageSearchForm,
	},
	setup() {
		const store = useStore();
		const route = useRoute();
		const router = useRouter();

		const chat = ref<HTMLDivElement>();

		const loadMoreButton = ref<HTMLButtonElement>();
		const historyObserver = ref<IntersectionObserver | null>(null);

		const offset = ref(0);
		const moreResultsAvailable = ref(false);
		const oldScrollTop = ref(0);
		const oldChatHeight = ref(0);

		const messages = computed(() => {
			const results = store.state.messageSearchResults?.results;

			if (!results) {
				return [];
			}

			return results;
		});

		const chan = computed(() => {
			const chanId = parseInt(String(route.params.id || ""), 10);
			return store.getters.findChannel(chanId);
		});

		const network = computed(() => {
			if (!chan.value) {
				return null;
			}

			return chan.value.network;
		});

		const channel = computed(() => {
			if (!chan.value) {
				return null;
			}

			return chan.value.channel;
		});

		const setActiveChannel = () => {
			if (!chan.value) {
				return;
			}

			store.commit("activeChannel", chan.value);
		};

		const closeSearch = () => {
			if (!channel.value) {
				return;
			}

			switchToChannel(channel.value);
		};

		const shouldDisplayDateMarker = (message: ClientMessage, id: number) => {
			const previousMessage = messages.value[id - 1];

			if (!previousMessage) {
				return true;
			}

			return new Date(previousMessage.time).getDay() !== new Date(message.time).getDay();
		};

		const clearSearchState = () => {
			offset.value = 0;
			store.commit("messageSearchResults", null);
			store.commit("messageSearchPendingQuery", null);
		};

		// Re-checks intersection of the "load more" button - needed when the
		// component stays mounted across a query change (route.query watcher):
		// if the button was already intersecting before the switch, a pure
		// content swap won't refire the IntersectionObserver callback on its own.
		const reobserveLoadMore = () => {
			if (historyObserver.value && loadMoreButton.value) {
				historyObserver.value.unobserve(loadMoreButton.value);
				historyObserver.value.observe(loadMoreButton.value);
			}
		};

		const restoreScroll = async (scrollTop: number) => {
			await nextTick();

			if (chat.value) {
				chat.value.scrollTop = scrollTop;
			}
		};

		const sameSearch = (
			a: {searchTerm: string; networkUuid: string; channelName: string},
			b: {searchTerm: string; networkUuid: string; channelName: string}
		) =>
			a.searchTerm === b.searchTerm &&
			a.networkUuid === b.networkUuid &&
			a.channelName === b.channelName;

		// force=true bypasses the cache-restore path (used by the "re-search"
		// eventbus event, when the user deliberately reruns the same query to
		// pick up new messages) and always fetches fresh.
		const doSearch = (force = false) => {
			if (!network.value || !channel.value) {
				return;
			}

			const query: SearchQuery = {
				networkUuid: network.value.uuid,
				channelName: channel.value.name,
				searchTerm: String(route.query.q || ""),
				offset: 0,
			};

			const cached = store.state.messageSearchResults;

			if (!force && cached && sameSearch(cached.query, query)) {
				// Same search session as before (e.g. jumped to a message and came
				// back) - resume instead of re-querying the server.
				offset.value = cached.query.offset;
				moreResultsAvailable.value = !!(
					cached.results.length && !(cached.results.length % 100)
				);
				void restoreScroll(cached.scrollTop);
				return;
			}

			clearSearchState(); // this is a new search, so we need to clear anything before that
			store.commit("messageSearchPendingQuery", query);
			socket.emit("search", query);
			reobserveLoadMore();
		};

		const onShowMoreClick = () => {
			if (!chat.value || !network.value || !channel.value) {
				return;
			}

			if (store.state.messageSearchPendingQuery) {
				// Already loading - avoid a duplicate request (the IntersectionObserver
				// can keep firing while the button stays visible during the fetch).
				return;
			}

			offset.value += 100;

			oldScrollTop.value = chat.value.scrollTop;
			oldChatHeight.value = chat.value.scrollHeight;

			const query: SearchQuery = {
				networkUuid: network.value.uuid,
				channelName: channel.value.name,
				searchTerm: String(route.query.q || ""),
				offset: offset.value,
			};
			store.commit("messageSearchPendingQuery", query);
			socket.emit("search", query);
		};

		const jumpToBottom = async () => {
			await nextTick();

			const el = chat.value;

			if (!el) {
				return;
			}

			el.scrollTop = el.scrollHeight;
		};

		// Jump to a search result - navigate to channel with message ID and time
		// If message isn't in memory, MessageList will scroll to closest match by time
		const jump = (message: ClientMessage) => {
			if (!store.state.settings.enableEnhancedSearch || !channel.value) {
				return;
			}

			const messageTime = new Date(message.time).getTime();
			switchToChannel(channel.value, message.id, messageTime);
		};

		// Jump to a specific date: reuses the datebefore:/dateafter: token syntax
		// search() already understands server-side - no backend changes needed.
		// Replaces any date tokens the picker previously added rather than
		// stacking them; other free-text search terms are preserved as-is.
		const jumpToDate = (event: Event) => {
			const value = (event.target as HTMLInputElement).value;

			if (!channel.value) {
				return;
			}

			const baseText = String(route.query.q || "")
				.replace(DATE_TOKEN_RE, "")
				.replace(/\s+/g, " ")
				.trim();

			if (!value) {
				router
					.push({
						name: "SearchResults",
						params: {id: channel.value.id},
						query: baseText ? {q: baseText} : {},
					})
					.catch((err) => {
						if (err.name === "NavigationDuplicated") {
							eventbus.emit("re-search");
						}
					});
				return;
			}

			// A single-day window: dateafter:<day> datebefore:<next day>.
			const endDate = new Date(`${value}T00:00:00`);
			endDate.setDate(endDate.getDate() + 1);
			const end = endDate.toISOString().slice(0, 10);
			const dateTokens = `dateafter:${value} datebefore:${end}`;

			router
				.push({
					name: "SearchResults",
					params: {id: channel.value.id},
					query: {q: baseText ? `${baseText} ${dateTokens}` : dateTokens},
				})
				.catch((err) => {
					if (err.name === "NavigationDuplicated") {
						eventbus.emit("re-search");
					}
				});
		};

		watch(
			() => route.params.id,
			() => {
				doSearch();
				setActiveChannel();
			}
		);

		watch(
			() => route.query,
			() => {
				doSearch();
				setActiveChannel();
			}
		);

		watch(messages, async () => {
			moreResultsAvailable.value = !!(
				messages.value.length && !(messages.value.length % 100)
			);

			if (!offset.value) {
				await jumpToBottom();
			} else {
				await nextTick();

				const el = chat.value;

				if (!el) {
					return;
				}

				const currentChatHeight = el.scrollHeight;
				el.scrollTop = oldScrollTop.value + currentChatHeight - oldChatHeight.value;
			}
		});

		// Named so onUnmounted can unregister the exact same listener.
		const forceSearch = () => doSearch(true);

		onMounted(() => {
			setActiveChannel();
			doSearch();

			eventbus.on("escapekey", closeSearch);
			eventbus.on("re-search", forceSearch);

			void nextTick(() => {
				if (!chat.value || !window.IntersectionObserver) {
					return;
				}

				historyObserver.value = new window.IntersectionObserver((entries) => {
					entries.forEach((entry) => {
						if (entry.isIntersecting) {
							onShowMoreClick();
						}
					});
				}, {root: chat.value});

				if (loadMoreButton.value) {
					historyObserver.value.observe(loadMoreButton.value);
				}
			});
		});

		onUnmounted(() => {
			eventbus.off("escapekey", closeSearch);
			eventbus.off("re-search", forceSearch);

			historyObserver.value?.disconnect();

			// Persist scroll position (not the results/query - those already live
			// in the store) so a resumed session lands back where it was left.
			if (chat.value) {
				store.commit("messageSearchScrollTop", chat.value.scrollTop);
			}
		});

		return {
			chat,
			loadMoreButton,
			messages,
			moreResultsAvailable,
			network,
			channel,
			route,
			offset,
			store,
			setActiveChannel,
			closeSearch,
			shouldDisplayDateMarker,
			doSearch,
			onShowMoreClick,
			jumpToBottom,
			jump,
			jumpToDate,
		};
	},
});
</script>
