<template>
	<div>
		<div v-if="canRegisterProtocol || hasInstallPromptEvent">
			<h2>Native app</h2>
			<button
				v-if="hasInstallPromptEvent"
				type="button"
				class="btn"
				@click.prevent="nativeInstallPrompt"
			>
				Add The Lounge to Home screen
			</button>
			<button
				v-if="canRegisterProtocol"
				type="button"
				class="btn"
				@click.prevent="registerProtocol"
			>
				Open irc:// URLs with The Lounge
			</button>
		</div>
		<div v-if="store.state.serverConfiguration?.fileUpload">
			<h2>File uploads</h2>
			<div>
				<label class="opt">
					<input
						:checked="store.state.settings.uploadCanvas"
						type="checkbox"
						name="uploadCanvas"
					/>
					Attempt to remove metadata from images before uploading
					<span
						class="tooltipped tooltipped-n tooltipped-no-delay"
						aria-label="This option renders the image into a canvas element to remove metadata from the image.
	This may break orientation if your browser does not support that."
					>
						<button class="extra-help" />
					</span>
				</label>
				<div v-if="store.state.serverConfiguration?.allowFileUploadBackendSelection">
					<label for="uploadTo" class="opt">Upload Backend</label>
					<select
						id="uploadTo"
						:value="store.state.settings.uploadTo"
						name="uploadTo"
						class="input"
					>
						<option value="new">TheLounge (Local)</option>
						<option value="imagebb">ImageBB</option>
						<option value="catbox">Catbox</option>
						<option value="onlyimage">OnlyImage</option>
						<option value="ptscreens">PTScreens</option>
					</select>
					<div v-if="store.state.settings.uploadTo !== 'new' && store.state.settings.uploadTo !== 'catbox'">
						<label for="uploadToken" class="opt">
							Upload API Key
							<span
								class="tooltipped tooltipped-n tooltipped-no-delay"
								aria-label="The API Key used to authorize uploads to the selected service."
							>
								<button class="extra-help" />
							</span>
						</label>
						<div class="password-container">
							<RevealPassword v-slot:default="slotProps">
								<input
									id="uploadToken"
									:value="store.state.settings.uploadToken"
									autocomplete="off"
									:type="slotProps.isVisible ? 'text' : 'password'"
									name="uploadToken"
									class="input"
									placeholder="Enter api auth key"
								/>
							</RevealPassword>
						</div>
					</div>
				</div>
			</div>
		</div>
		<div v-if="store.state.settings.searchEnabled">
			<h2>Enhanced search</h2>
			<label class="opt">
				<input
					:checked="store.state.settings.enableEnhancedSearch"
					type="checkbox"
					name="enableEnhancedSearch"
				/>
				Enable enhanced search with 'Jump to message'
			</label>
		</div>
		<div v-if="store.state.settings.searchEnabled">
			<h2>Input</h2>
			<label class="opt">
				<input
					:checked="store.state.settings.enableRainbowHotkey"
					type="checkbox"
					name="enableRainbowHotkey"
				/>
				Enable rainbow messages with 'Ctrl+R' hotkey
				<span
					class="tooltipped tooltipped-n tooltipped-no-delay"
					aria-label="You can still use rainbow text with '/rainbow' or '/rgb'"
				>
					<button class="extra-help" />
				</span>
			</label>
		</div>
		<div v-if="!store.state.serverConfiguration?.public">
			<h2>Settings synchronisation</h2>
			<label class="opt">
				<input
					:checked="store.state.settings.syncSettings"
					type="checkbox"
					name="syncSettings"
				/>
				Synchronize settings with other clients
			</label>
			<template v-if="!store.state.settings.syncSettings">
				<div v-if="store.state.serverHasSettings" class="settings-sync-panel">
					<p>
						<strong>Warning:</strong> Checking this box will override the settings of
						this client with those stored on the server.
					</p>
					<p>
						Use the button below to enable synchronization, and override any settings
						already synced to the server.
					</p>
					<button type="button" class="btn btn-small" @click="onForceSyncClick">
						Sync settings and enable
					</button>
				</div>
				<div v-else class="settings-sync-panel">
					<p>
						<strong>Warning:</strong> No settings have been synced before. Enabling this
						will sync all settings of this client as the base for other clients.
					</p>
				</div>
			</template>
		</div>
		<div v-if="!store.state.serverConfiguration?.public">
			<h2>Automatic away message</h2>

			<label class="opt">
				<label for="awayMessage" class="sr-only">Automatic away message</label>
				<input
					id="awayMessage"
					:value="store.state.settings.awayMessage"
					type="text"
					name="awayMessage"
					class="input"
					placeholder="Away message if The Lounge is not open"
				/>
			</label>
		</div>
	</div>
</template>

<style></style>

<script lang="ts">
import {computed, defineComponent, onMounted, ref} from "vue";
import {useStore} from "../../js/store";
import {BeforeInstallPromptEvent} from "../../js/types";
import RevealPassword from "../RevealPassword.vue";

let installPromptEvent: BeforeInstallPromptEvent | null = null;

window.addEventListener("beforeinstallprompt", (e) => {
	e.preventDefault();
	installPromptEvent = e as BeforeInstallPromptEvent;
});

export default defineComponent({
	name: "GeneralSettings",
	components: {
		RevealPassword,
	},
	setup() {
		const store = useStore();
		const canRegisterProtocol = ref(false);

		const hasInstallPromptEvent = computed(() => {
			// TODO: This doesn't hide the button after clicking
			return installPromptEvent !== null;
		});

		onMounted(() => {
			// Enable protocol handler registration if supported,
			// and the network configuration is not locked
			canRegisterProtocol.value =
				!!window.navigator.registerProtocolHandler &&
				!store.state.serverConfiguration?.lockNetwork;
		});

		const nativeInstallPrompt = () => {
			if (!installPromptEvent) {
				return;
			}

			installPromptEvent.prompt().catch((e) => {
				// eslint-disable-next-line no-console
				console.error(e);
			});

			installPromptEvent = null;
		};

		const onForceSyncClick = () => {
			store.dispatch("settings/syncAll", true).catch((e) => {
				// eslint-disable-next-line no-console
				console.error(e);
			});

			store
				.dispatch("settings/update", {
					name: "syncSettings",
					value: true,
					sync: true,
				})
				.catch((e) => {
					// eslint-disable-next-line no-console
					console.error(e);
				});
		};

		const registerProtocol = () => {
			const uri = document.location.origin + document.location.pathname + "?uri=%s";
			// The third argument was deprecated and has been removed from the spec
			window.navigator.registerProtocolHandler("irc", uri);
			window.navigator.registerProtocolHandler("ircs", uri);
		};

		return {
			store,
			canRegisterProtocol,
			hasInstallPromptEvent,
			nativeInstallPrompt,
			onForceSyncClick,
			registerProtocol,
		};
	},
});
</script>
