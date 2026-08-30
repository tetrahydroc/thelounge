<template>
	<form :class="['message-search', {opened: searchOpened}]" @submit.prevent="searchMessages">
		<div class="input-wrapper">
			<input
				ref="searchInputField"
				v-model="searchInput"
				type="search"
				name="search"
				class="input"
				:class="{'has-resume-hint': showResumeHint}"
				placeholder="Search messages…"
				@blur="closeSearch"
				@keyup.esc="closeSearch"
				@input="resumedFromCache = false"
			/>
			<span
				v-if="showResumeHint"
				class="tooltipped tooltipped-w tooltipped-no-delay resume-hint"
				aria-label="Press Enter to resume your last search"
			>
				⟲
			</span>
		</div>
		<button
			v-if="!onSearchPage"
			class="search"
			type="button"
			aria-label="Search messages in this channel"
			@mousedown.prevent="toggleSearch"
		/>
	</form>
</template>

<style>
form.message-search {
	display: flex;
}

form.message-search .input-wrapper {
	display: flex;
}

form.message-search input {
	width: 100%;
	height: auto !important;
	margin: 7px 0;
	border: 0;
	color: inherit;
	background-color: #fafafa;
	appearance: none;
}

form.message-search input::placeholder {
	color: rgba(0, 0, 0, 0.35);
}

@media (min-width: 480px) {
	form.message-search input {
		min-width: 140px;
	}

	form.message-search input:focus {
		min-width: 220px;
	}
}

form.message-search .input-wrapper {
	position: absolute;
	top: 45px;
	left: 0;
	right: 0;
	z-index: 1;
	height: 0;
	overflow: hidden;
	background: var(--window-bg-color);
}

form.message-search .input-wrapper input {
	margin: 7px;
}

form.message-search .input-wrapper input.has-resume-hint {
	padding-right: 22px;
}

form.message-search .resume-hint {
	position: absolute;
	right: 20px;
	top: 50%;
	transform: translateY(-50%);
	color: rgba(0, 0, 0, 0.35);
	font-size: 14px;
	cursor: default;
}

form.message-search.opened .input-wrapper {
	height: 50px;
}

#chat form.message-search button {
	display: flex;
	color: #607992;
}
</style>

<script lang="ts">
import {computed, defineComponent, onMounted, PropType, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import eventbus from "../js/eventbus";
import {ClientNetwork, ClientChan} from "../js/types";
import {useStore} from "../js/store";

export default defineComponent({
	name: "MessageSearchForm",
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const searchOpened = ref(false);
		const searchInput = ref("");
		const resumedFromCache = ref(false);
		const router = useRouter();
		const route = useRoute();
		const store = useStore();

		const showResumeHint = computed(() => resumedFromCache.value && !!searchInput.value);

		const searchInputField = ref<HTMLInputElement | null>(null);

		const onSearchPage = computed(() => {
			return route.name === "SearchResults";
		});

		watch(route, (newValue) => {
			if (newValue.query.q) {
				searchInput.value = String(newValue.query.q);
			}
		});

		onMounted(() => {
			if (route.query.q) {
				searchInput.value = String(route.query.q);
			} else {
				// This component remounts fresh on every route change (it's
				// rendered separately by Chat.vue and SearchResults.vue, not a
				// single persistent instance) - route.query.q is empty outside
				// the search view itself. Fall back to the last completed
				// search for this network/channel, if any, so reopening search
				// from the normal chat view still shows what you last searched.
				const lastSearch = store.state.messageSearchResults?.query;

				if (
					lastSearch &&
					lastSearch.networkUuid === props.network.uuid &&
					lastSearch.channelName === props.channel.name
				) {
					searchInput.value = lastSearch.searchTerm;
					resumedFromCache.value = true;
				}
			}

			searchOpened.value = onSearchPage.value;

			if (searchInputField.value && !searchInput.value && searchOpened.value) {
				searchInputField.value.focus();
			}
		});

		const closeSearch = () => {
			if (!onSearchPage.value) {
				searchInput.value = "";
				searchOpened.value = false;
			}
		};

		const toggleSearch = () => {
			if (searchOpened.value) {
				searchInputField.value?.blur();
				return;
			}

			searchOpened.value = true;
			searchInputField.value?.focus();
		};

		const searchMessages = (event: Event) => {
			event.preventDefault();

			if (!searchInput.value) {
				return;
			}

			router
				.push({
					name: "SearchResults",
					params: {
						id: props.channel.id,
					},
					query: {
						q: searchInput.value,
					},
				})
				.catch((err) => {
					if (err.name === "NavigationDuplicated") {
						// Search for the same query again
						eventbus.emit("re-search");
					}
				});
		};

		return {
			searchOpened,
			searchInput,
			searchInputField,
			resumedFromCache,
			showResumeHint,
			closeSearch,
			toggleSearch,
			searchMessages,
			onSearchPage,
		};
	},
});
</script>
