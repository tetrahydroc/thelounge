import {store} from "./store";

const POLL_INTERVAL_MS = 10 * 60 * 1000;

async function checkStaleness() {
	try {
		const response = await fetch("/version-hash", {cache: "no-store"});

		if (!response.ok) {
			return;
		}

		const serverHash = (await response.text()).trim();

		if (serverHash && serverHash !== __CLIENT_BUILD_HASH__) {
			store.commit("clientBuildStale", true);
		}
	} catch {
		// Offline/network error - not our concern here, the regular
		// socket reconnect logic already surfaces connectivity issues.
	}
}

// Started once from App.vue's onMounted. Skipped entirely in dev builds
// (webpack bakes in the literal "dev" there) - the server always computes a
// real hash regardless of NODE_ENV, so dev would otherwise always mismatch.
export function startBuildStalenessCheck() {
	if (__CLIENT_BUILD_HASH__ === "dev") {
		return;
	}

	// Also treat the server's build hash sent at connect time (part of the
	// "configuration" socket payload) as an immediate signal - it only ever
	// arrives once per tab, so it can't catch a redeploy that happens while
	// the tab stays open, but it's a free extra check for a page load that
	// was already stale before the first poll interval elapses.
	if (
		store.state.serverConfiguration &&
		store.state.serverConfiguration.buildHash !== __CLIENT_BUILD_HASH__
	) {
		store.commit("clientBuildStale", true);
	}

	void checkStaleness();
	setInterval(() => void checkStaleness(), POLL_INTERVAL_MS);
}
