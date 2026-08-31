<template>
	<form
		:class="['message-search', {opened: searchOpened, inline: onSearchPage}]"
		@submit.prevent="searchMessages"
	>
		<div class="input-wrapper">
			<input
				ref="searchInputField"
				v-model="searchInput"
				type="search"
				name="search"
				class="input"
				placeholder="Search messages…"
				@blur="closeSearch"
				@keyup.esc="closeSearch"
				@input="resumedFromCache = false"
			/>
		</div>
		<span v-if="showResumeHint" class="resume-hint">
			Continue search<template v-if="resumeResultCount !== null">
				({{ resumeResultCount }} result{{ resumeResultCount === 1 ? "" : "s" }})</template
			>
		</span>
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

/* A small tab hanging directly off the bottom of the input - same
   background/border as the input itself (matching its own hardcoded
   #fafafa/border colors right above, not a semantic accent color like the
   highlight-* variables, which mean "you were mentioned" elsewhere in the
   app) and flush against it (no gap, square top corners) so it reads as
   part of the search bar rather than a separate floating tooltip.
   It's a sibling of .input-wrapper rather than nested inside it, since
   .input-wrapper's own overflow:hidden (needed for the open/close collapse
   animation below) would otherwise clip it off. Positioned against the same
   coordinate space .input-wrapper uses (the dropdown sits at top:45px,
   opens to 50px tall) - overridden below for the .inline variant, which has
   its own local, much smaller box. */
form.message-search .resume-hint {
	position: absolute;
	left: 7px;
	top: 95px;
	padding: 1px 6px;
	border: 1px solid #cdd3da;
	border-top: none;
	border-radius: 0 0 3px 3px;
	background-color: #fafafa;
	color: var(--body-color-muted);
	font-size: 11px;
	line-height: 1.3;
	white-space: nowrap;
	pointer-events: none;
	cursor: default;
}

form.message-search.opened .input-wrapper {
	height: 50px;
}

/* On the search results page the form is always "open" and sits inline in
   the header next to the date picker and close button, rather than as a
   toggled full-width dropdown - so lay it out normally instead of via the
   absolute overlay above, which otherwise stretches under those siblings. */
form.message-search.inline {
	position: relative;
	flex-shrink: 0;
}

form.message-search.inline .input-wrapper {
	position: relative;
	top: auto;
	left: auto;
	right: auto;
	z-index: auto;
	height: auto;
	overflow: visible;
	background: none;
	width: 180px;
	transition: width 0.15s;
}

form.message-search.inline .input-wrapper:focus-within {
	width: 220px;
}

form.message-search.inline .input-wrapper input {
	margin: 0 6px;
	min-width: 0;
}

form.message-search.inline .resume-hint {
	left: 6px;
	top: 100%;
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

		const showResumeHint = computed(
			() => searchOpened.value && resumedFromCache.value && !!searchInput.value
		);
		const resumeResultCount = computed(
			() => store.state.messageSearchResults?.results.length ?? null
		);

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
			resumeResultCount,
			closeSearch,
			toggleSearch,
			searchMessages,
			onSearchPage,
		};
	},
});
</script>
