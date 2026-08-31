<template>
	<div v-if="store.state.clientBuildStale" id="stale-build-banner">
		<span>A new version of the UI is available.</span>
		<button class="btn btn-small" @click="reload">Reload</button>
	</div>
</template>

<style>
#stale-build-banner {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 1000;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	padding: 6px 10px;
	background-color: var(--highlight-bg-color);
	border-bottom: 1px solid var(--highlight-border-color);
	color: var(--body-color);
	font-size: 13px;
}
</style>

<script lang="ts">
import {defineComponent} from "vue";
import {useStore} from "../js/store";

export default defineComponent({
	name: "StaleBuildBanner",
	setup() {
		const store = useStore();

		const reload = () => {
			window.location.reload();
		};

		return {
			store,
			reload,
		};
	},
});
</script>
