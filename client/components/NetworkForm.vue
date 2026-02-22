<template>
	<div id="connect" class="window" role="tabpanel" aria-label="Connect">
		<div class="header">
			<SidebarToggle />
		</div>
		<form class="container" method="post" action="" @submit.prevent="onSubmit">
			<h1 class="title">
				<template v-if="defaults.uuid">
					<input v-model="defaults.uuid" type="hidden" name="uuid" />
					Edit {{ defaults.name }}
				</template>
				<template v-else>
					Connect
					<template
						v-if="config?.lockNetwork && store?.state.serverConfiguration?.public"
					>
						to {{ defaults.name }}
					</template>
				</template>
			</h1>
			<template v-if="!config?.lockNetwork">
				<h2>Network settings</h2>
				<div class="connect-row">
					<label for="connect:name">Name</label>
					<input
						id="connect:name"
						v-model.trim="defaults.name"
						class="input"
						name="name"
						maxlength="100"
					/>
				</div>
				<div class="connect-row">
					<label for="connect:host">Server</label>
					<div class="input-wrap">
						<input
							id="connect:host"
							v-model.trim="defaults.host"
							class="input"
							name="host"
							aria-label="Server address"
							maxlength="255"
							required
						/>
						<span id="connect:portseparator">:</span>
						<input
							id="connect:port"
							v-model="defaults.port"
							class="input"
							type="number"
							min="1"
							max="65535"
							name="port"
							aria-label="Server port"
						/>
					</div>
				</div>
				<div class="connect-row">
					<label for="connect:password">Password</label>
					<RevealPassword
						v-slot:default="slotProps"
						class="input-wrap password-container"
					>
						<input
							id="connect:password"
							v-model="defaults.password"
							class="input"
							:type="slotProps.isVisible ? 'text' : 'password'"
							placeholder="Server password (optional)"
							name="password"
							maxlength="300"
						/>
					</RevealPassword>
				</div>
				<div class="connect-row">
					<label></label>
					<div class="input-wrap">
						<label class="tls">
							<input
								v-model="defaults.tls"
								type="checkbox"
								name="tls"
								:disabled="defaults.hasSTSPolicy"
							/>
							Use secure connection (TLS)
							<span
								v-if="defaults.hasSTSPolicy"
								class="tooltipped tooltipped-n tooltipped-no-delay"
								aria-label="This network has a strict transport security policy, you will be unable to disable TLS"
								>🔒 STS</span
							>
						</label>
						<label class="tls">
							<input
								v-model="defaults.rejectUnauthorized"
								type="checkbox"
								name="rejectUnauthorized"
							/>
							Only allow trusted certificates
						</label>
					</div>
				</div>

				<h2>Proxy Settings</h2>
				<div class="connect-row">
					<label></label>
					<div class="input-wrap">
						<label for="connect:proxyEnabled">
							<input
								id="connect:proxyEnabled"
								v-model="defaults.proxyEnabled"
								type="checkbox"
								name="proxyEnabled"
							/>
							Enable Proxy
						</label>
					</div>
				</div>
				<template v-if="defaults.proxyEnabled">
					<div class="connect-row">
						<label for="connect:proxyHost">SOCKS Address</label>
						<div class="input-wrap">
							<input
								id="connect:proxyHost"
								v-model.trim="defaults.proxyHost"
								class="input"
								name="proxyHost"
								aria-label="Proxy host"
								maxlength="255"
							/>
							<span id="connect:proxyPortSeparator">:</span>
							<input
								id="connect:proxyPort"
								v-model="defaults.proxyPort"
								class="input"
								type="number"
								min="1"
								max="65535"
								name="proxyPort"
								aria-label="SOCKS port"
							/>
						</div>
					</div>

					<div class="connect-row">
						<label for="connect:proxyUsername">Proxy username</label>
						<input
							id="connect:proxyUsername"
							ref="proxyUsernameInput"
							v-model.trim="defaults.proxyUsername"
							class="input username"
							name="proxyUsername"
							maxlength="100"
							placeholder="Proxy username"
						/>
					</div>

					<div class="connect-row">
						<label for="connect:proxyPassword">Proxy password</label>
						<RevealPassword
							v-slot:default="slotProps"
							class="input-wrap password-container"
						>
							<input
								id="connect:proxyPassword"
								ref="proxyPassword"
								v-model="defaults.proxyPassword"
								class="input"
								:type="slotProps.isVisible ? 'text' : 'password'"
								placeholder="Proxy password"
								name="proxyPassword"
								maxlength="300"
							/>
						</RevealPassword>
					</div>
				</template>
			</template>
			<template v-else-if="config.lockNetwork && !store.state.serverConfiguration?.public">
				<h2>Network settings</h2>
				<div class="connect-row">
					<label for="connect:name">Name</label>
					<input
						id="connect:name"
						v-model.trim="defaults.name"
						class="input"
						name="name"
						maxlength="100"
					/>
				</div>
				<div class="connect-row">
					<label for="connect:password">Password</label>
					<RevealPassword
						v-slot:default="slotProps"
						class="input-wrap password-container"
					>
						<input
							id="connect:password"
							v-model="defaults.password"
							class="input"
							:type="slotProps.isVisible ? 'text' : 'password'"
							placeholder="Server password (optional)"
							name="password"
							maxlength="300"
						/>
					</RevealPassword>
				</div>
			</template>

			<h2>User preferences</h2>
			<div class="connect-row">
				<label for="connect:nick">Nick</label>
				<input
					id="connect:nick"
					v-model="defaults.nick"
					class="input nick"
					name="nick"
					pattern="[^\s:!@]+"
					maxlength="100"
					required
					@input="onNickChanged"
				/>
			</div>
			<template v-if="!config?.useHexIp">
				<div class="connect-row">
					<label for="connect:username">Username</label>
					<input
						id="connect:username"
						ref="usernameInput"
						v-model.trim="defaults.username"
						class="input username"
						name="username"
						maxlength="100"
					/>
				</div>
			</template>
			<div class="connect-row">
				<label for="connect:realname">Real name</label>
				<input
					id="connect:realname"
					v-model.trim="defaults.realname"
					class="input"
					name="realname"
					maxlength="300"
				/>
			</div>
			<div class="connect-row">
				<label for="connect:leaveMessage">Leave message</label>
				<input
					id="connect:leaveMessage"
					v-model.trim="defaults.leaveMessage"
					autocomplete="off"
					class="input"
					name="leaveMessage"
					placeholder="The Lounge - https://thelounge.chat"
				/>
			</div>
			<template v-if="defaults.uuid && !store.state.serverConfiguration?.public">
				<div class="connect-row">
					<label for="connect:commands">
						Commands
						<span
							class="tooltipped tooltipped-ne tooltipped-no-delay"
							aria-label="One /command per line.
Each command will be executed in
the server tab on new connection"
						>
							<button class="extra-help" />
						</span>
					</label>
					<textarea
						id="connect:commands"
						ref="commandsInput"
						autocomplete="off"
						:value="defaults.commands ? defaults.commands.join('\n') : ''"
						class="input"
						name="commands"
						@input="resizeCommandsInput"
					/>
				</div>
			</template>
			<template v-else-if="!defaults.uuid">
				<div class="connect-row">
					<label for="connect:channels">Channels</label>
					<input
						id="connect:channels"
						v-model.trim="defaults.join"
						class="input"
						name="join"
					/>
				</div>
			</template>

			<template v-if="config?.fishEnabled">
				<h2>FiSH (Blowfish)</h2>
				<div class="connect-row">
					<label for="connect:fishGlobalKey">Global key</label>
					<input
						id="connect:fishGlobalKey"
						v-model.trim="defaults.fishGlobalKey"
						class="input"
						name="fishGlobalKey"
						placeholder="Optional global key for this network"
					/>
				</div>
				<div class="connect-row">
					<label for="connect:fishGlobalKeyMode">Mode</label>
					<select
						id="connect:fishGlobalKeyMode"
						v-model="defaults.fishGlobalKeyMode"
						class="input"
						name="fishGlobalKeyMode"
					>
						<option value="ecb">ECB (default)</option>
						<option value="cbc">CBC (recommended)</option>
					</select>
				</div>
				<div class="connect-row" style="display: block">
					<label for="connect:fishKeys" style="margin-bottom: 5px">
						Per-channel or User-Channels
						<span
							class="tooltipped tooltipped-ne tooltipped-no-delay"
							aria-label="#channel key or nick key"
						>
							<button class="extra-help" />
						</span>
					</label>
					<div class="fish-keys-section">
						<div
							v-for="(entry, index) in fishKeysEntries"
							:key="index"
							class="connect-row fish-key-row"
						>
							<div class="input-wrap fish-key-inputs">
								<input
									v-model="entry.target"
									class="input fish-target-input"
									placeholder="#channel or nick"
									maxlength="100"
									aria-label="Channel or user name"
									style="margin: 0"
									@input="entry.target = entry.target.toLowerCase()"
								/>
								<input
									v-model="entry.key"
									type="password"
									class="input fish-key-input"
									placeholder="encryption key"
									maxlength="300"
									aria-label="Encryption key"
									style="margin: 0"
								/>
								<select
									v-model="entry.mode"
									class="input fish-mode-select"
									aria-label="Encryption mode"
									style="margin: 0"
								>
									<option value="ecb">ECB</option>
									<option value="cbc">CBC</option>
								</select>
								<button
									type="button"
									class="btn fish-remove-btn"
									:disabled="fishKeysEntries.length <= 1"
									title="Remove entry"
									style="margin: 0"
									@click="removeFishKeyEntry(index)"
								>
									Remove
								</button>
							</div>
						</div>
						<div class="connect-row">
							<button type="button" class="btn" @click="addFishKeyEntry">
								Add Entry
							</button>
						</div>
					</div>
				</div>
			</template>

			<template v-if="config?.encodingEnabled">
				<h2>Encodings</h2>
				<div class="connect-row" style="display: block">
					<label style="margin-bottom: 5px">
						Per-Nick Encoding
						<span
							class="tooltipped tooltipped-ne tooltipped-no-delay"
							aria-label="Set a specific character encoding for messages from a nick (e.g. utf8, latin1, cp1252, iso-8859-2)"
						>
							<button class="extra-help" />
						</span>
					</label>
					<div class="encoding-section">
						<div
							v-for="(entry, index) in encodingEntries"
							:key="index"
							class="connect-row encoding-row"
						>
							<div class="input-wrap encoding-inputs">
								<input
									v-model="entry.nick"
									class="input encoding-nick-input"
									placeholder="nick"
									maxlength="100"
									aria-label="Nick name"
									style="margin: 0"
									@input="entry.nick = entry.nick.toLowerCase()"
								/>
								<input
									v-model="entry.encoding"
									class="input encoding-value-input"
									placeholder="e.g. utf8, latin1, cp1252"
									maxlength="50"
									aria-label="Encoding"
									style="margin: 0"
								/>
								<button
									type="button"
									class="btn encoding-remove-btn"
									title="Remove entry"
									style="width: auto; margin: 0"
									@click="removeEncodingEntry(index)"
								>
									Remove
								</button>
							</div>
						</div>
						<div class="connect-row">
							<button type="button" class="btn" @click="addEncodingEntry">
								Add Entry
							</button>
						</div>
					</div>
				</div>
			</template>

			<template v-if="config?.ftpInviteEnabled">
				<h2>FTP Invite</h2>
				<div class="connect-row">
					<label></label>
					<div class="input-wrap">
						<label for="connect:ftpEnabled">
							<input
								id="connect:ftpEnabled"
								v-model="defaults.ftpEnabled"
								type="checkbox"
								name="ftpEnabled"
							/>
							Enable FTP Invite
						</label>
					</div>
				</div>
				<template v-if="defaults.ftpEnabled">
					<div class="connect-row">
						<label for="connect:ftpHost">FTP Host</label>
						<input
							id="connect:ftpHost"
							v-model.trim="defaults.ftpHost"
							class="input"
							name="ftpHost"
							aria-label="FTP server address"
							maxlength="255"
						/>
					</div>
					<div class="connect-row">
						<label for="connect:ftpPort">FTP Port</label>
						<input
							id="connect:ftpPort"
							v-model="defaults.ftpPort"
							class="input"
							type="number"
							min="1"
							max="65535"
							name="ftpPort"
							aria-label="FTP server port"
						/>
					</div>
					<div class="connect-row">
						<label for="connect:ftpUsername">FTP Username</label>
						<input
							id="connect:ftpUsername"
							v-model.trim="defaults.ftpUsername"
							class="input"
							name="ftpUsername"
							maxlength="100"
						/>
					</div>
					<div class="connect-row">
						<label for="connect:ftpPassword">FTP Password</label>
						<RevealPassword
							v-slot:default="slotProps"
							class="input-wrap password-container"
						>
							<input
								id="connect:ftpPassword"
								v-model="defaults.ftpPassword"
								class="input"
								:type="slotProps.isVisible ? 'text' : 'password'"
								placeholder="FTP password"
								name="ftpPassword"
								maxlength="300"
							/>
						</RevealPassword>
					</div>
					<div class="connect-row">
						<label></label>
						<div class="input-wrap">
							<label for="connect:ftpTls">
								<input
									id="connect:ftpTls"
									v-model="defaults.ftpTls"
									type="checkbox"
									name="ftpTls"
								/>
								Use FTP over explicit TLS (FTPS)
							</label>
						</div>
					</div>
					<div class="connect-row">
						<label></label>
						<div class="input-wrap">
							<label for="connect:ftpAutoInvite">
								<input
									id="connect:ftpAutoInvite"
									v-model="defaults.ftpAutoInvite"
									type="checkbox"
									name="ftpAutoInvite"
								/>
								Auto-invite after connecting
							</label>
						</div>
					</div>
				</template>
			</template>

			<template v-if="store.state.serverConfiguration?.public">
				<template v-if="config?.lockNetwork">
					<div class="connect-row">
						<label></label>
						<div class="input-wrap">
							<label class="tls">
								<input v-model="displayPasswordField" type="checkbox" />
								I have a password
							</label>
						</div>
					</div>
					<div v-if="displayPasswordField" class="connect-row">
						<label for="connect:password">Password</label>
						<RevealPassword
							v-slot:default="slotProps"
							class="input-wrap password-container"
						>
							<input
								id="connect:password"
								ref="publicPassword"
								v-model="defaults.password"
								class="input"
								:type="slotProps.isVisible ? 'text' : 'password'"
								placeholder="Server password (optional)"
								name="password"
								maxlength="300"
							/>
						</RevealPassword>
					</div>
				</template>
			</template>
			<template v-else>
				<h2 id="label-auth">Authentication</h2>
				<div class="connect-row connect-auth" role="group" aria-labelledby="label-auth">
					<label class="opt">
						<input
							:checked="!defaults.sasl"
							type="radio"
							name="sasl"
							value=""
							@change="setSaslAuth('')"
						/>
						No authentication
					</label>
					<label class="opt">
						<input
							:checked="defaults.sasl === 'plain'"
							type="radio"
							name="sasl"
							value="plain"
							@change="setSaslAuth('plain')"
						/>
						Username + password (SASL PLAIN)
					</label>
					<label
						v-if="!store.state.serverConfiguration?.public && defaults.tls"
						class="opt"
					>
						<input
							:checked="defaults.sasl === 'external'"
							type="radio"
							name="sasl"
							value="external"
							@change="setSaslAuth('external')"
						/>
						Client certificate (SASL EXTERNAL)
					</label>
				</div>

				<template v-if="defaults.sasl === 'plain'">
					<div class="connect-row">
						<label for="connect:username">Account</label>
						<input
							id="connect:saslAccount"
							v-model.trim="defaults.saslAccount"
							class="input"
							name="saslAccount"
							maxlength="100"
							required
						/>
					</div>
					<div class="connect-row">
						<label for="connect:password">Password</label>
						<RevealPassword
							v-slot:default="slotProps"
							class="input-wrap password-container"
						>
							<input
								id="connect:saslPassword"
								v-model="defaults.saslPassword"
								class="input"
								:type="slotProps.isVisible ? 'text' : 'password'"
								name="saslPassword"
								maxlength="300"
								required
							/>
						</RevealPassword>
					</div>
				</template>
				<div v-else-if="defaults.sasl === 'external'" class="connect-sasl-external">
					<p>The Lounge automatically generates and manages the client certificate.</p>
					<p>
						On the IRC server, you will need to tell the services to attach the
						certificate fingerprint (certfp) to your account, for example:
					</p>
					<pre><code>/msg NickServ CERT ADD</code></pre>
				</div>
			</template>

			<div>
				<button type="submit" class="btn" :disabled="disabled ? true : false">
					<template v-if="defaults.uuid">Save network</template>
					<template v-else>Connect</template>
				</button>
			</div>
		</form>
	</div>
</template>

<style>
#connect .connect-auth {
	display: block;
	margin-bottom: 10px;
}

#connect .connect-auth .opt {
	display: block;
	width: 100%;
}

#connect .connect-auth input {
	margin: 3px 10px 0 0;
}

#connect .connect-sasl-external {
	padding: 10px;
	border-radius: 2px;
	background-color: #d9edf7;
	color: #31708f;
}

#connect .connect-sasl-external pre {
	margin: 0;
	user-select: text;
}

/* FiSH Keys section styles */
.fish-keys-section {
	width: 100%;
	padding-top: 10px;
}

.fish-key-row {
	margin-bottom: 5px;
}

.fish-key-label {
	width: 25%;
	display: flex;
	align-items: center;
}

.fish-key-inputs {
	display: flex;
	gap: 10px;
	align-items: center;
}

.fish-target-input {
	flex: 1;
	min-width: 120px;
}

.fish-key-input {
	flex: 2;
	min-width: 150px;
}

.fish-remove-btn {
	flex-shrink: 0;
	width: 55px !important;
	min-width: 55px !important;
	padding: 9px 5px !important;
	margin-left: 10px;
	font-size: 10px !important;
	text-align: center !important;
	letter-spacing: 0 !important;
}

.fish-mode-select {
	flex: 0;
	min-width: 80px;
}

.fish-remove-btn:disabled {
	opacity: 0.5;
}

.fish-remove-btn:disabled {
	opacity: 0.5;
}

@media (width <= 768px) {
	.fish-key-inputs {
		flex-direction: column;
		gap: 5px;
	}

	.fish-target-input,
	.fish-key-input {
		min-width: auto;
	}

	.fish-remove-btn {
		margin-left: 0;
		align-self: stretch;
	}
}

/* Nick Encoding section styles */
.encoding-section {
	width: 100%;
	padding-top: 10px;
}

.encoding-row {
	margin-bottom: 5px;
}

.encoding-inputs {
	display: flex;
	gap: 10px;
	align-items: center;
}

.encoding-nick-input {
	flex: 1;
	min-width: 120px;
}

.encoding-value-input {
	flex: 2;
	min-width: 150px;
}

.encoding-remove-btn {
	flex-shrink: 0;
	min-width: 70px;
}

.encoding-remove-btn:disabled {
	opacity: 0.5;
}

@media (width <= 768px) {
	.encoding-inputs {
		flex-direction: column;
		gap: 5px;
	}

	.encoding-nick-input,
	.encoding-value-input {
		min-width: auto;
	}

	.encoding-remove-btn {
		margin-left: 0;
		align-self: stretch;
	}
}
</style>

<script lang="ts">
import RevealPassword from "./RevealPassword.vue";
import SidebarToggle from "./SidebarToggle.vue";
import {defineComponent, nextTick, PropType, ref, watch, computed} from "vue";
import {useStore} from "../js/store";
import {ClientNetwork} from "../js/types";

export type NetworkFormDefaults = Partial<ClientNetwork> & {
	join?: string;
	username?: string;
	host?: string;
	commands?: string[];
	tls?: boolean;
	port?: number;
	sasl?: string;
	password?: string;
	hasSTSPolicy?: boolean;
	saslAccount?: string;
	saslPassword?: string;
	leaveMessage?: string;
	realname?: string;
	proxyEnabled?: boolean;
	proxyHost?: string;
	proxyPort?: number;
	proxyUsername?: string;
	proxyPassword?: string;
	rejectUnauthorized?: boolean;
	fishGlobalKey?: string;
	fishKeys?: Record<string, string>;
	fishGlobalKeyMode?: "ecb" | "cbc";
	fishKeyModes?: Record<string, "ecb" | "cbc">;
	ftpEnabled?: boolean;
	ftpHost?: string;
	ftpPort?: number;
	ftpUsername?: string;
	ftpPassword?: string;
	ftpTls?: boolean;
	ftpAutoInvite?: boolean;
	encodingMap?: Record<string, string>;
};

export default defineComponent({
	name: "NetworkForm",
	components: {
		RevealPassword,
		SidebarToggle,
	},
	props: {
		handleSubmit: {
			type: Function as PropType<(network: ClientNetwork) => void>,
			required: true,
		},
		defaults: {
			type: Object as PropType<NetworkFormDefaults>,
			required: true,
		},
		disabled: Boolean,
	},
	setup(props) {
		const store = useStore();
		const config = ref(store.state.serverConfiguration);
		const previousUsername = ref(props.defaults?.username);
		const displayPasswordField = ref(false);

		const publicPassword = ref<HTMLInputElement | null>(null);

		watch(displayPasswordField, (newValue) => {
			if (newValue) {
				void nextTick(() => {
					publicPassword.value?.focus();
				});
			}
		});

		const commandsInput = ref<HTMLInputElement | null>(null);

		const resizeCommandsInput = () => {
			if (!commandsInput.value) {
				return;
			}

			// Reset height first so it can down size
			commandsInput.value.style.height = "";

			// 2 pixels to account for the border
			commandsInput.value.style.height = `${Math.ceil(
				commandsInput.value.scrollHeight + 2
			)}px`;
		};

		watch(
			() => props.defaults?.commands,
			() => {
				void nextTick(() => {
					resizeCommandsInput();
				});
			}
		);

		watch(
			() => props.defaults?.tls,
			(isSecureChecked) => {
				const ports = [6667, 6697];
				const newPort = isSecureChecked ? 0 : 1;

				// If you disable TLS and current port is 6697,
				// set it to 6667, and vice versa
				if (props.defaults?.port === ports[newPort]) {
					props.defaults.port = ports[1 - newPort];
				}
			}
		);

		const setSaslAuth = (type: string) => {
			if (props.defaults) {
				props.defaults.sasl = type;
			}
		};

		const usernameInput = ref<HTMLInputElement | null>(null);

		const onNickChanged = (event: Event) => {
			if (!usernameInput.value) {
				return;
			}

			const usernameRef = usernameInput.value;

			if (!usernameRef.value || usernameRef.value === previousUsername.value) {
				usernameRef.value = (event.target as HTMLInputElement)?.value;
			}

			previousUsername.value = (event.target as HTMLInputElement)?.value;
		};

		// FiSH Keys table management
		interface FishKeyEntry {
			target: string;
			key: string;
			mode: "ecb" | "cbc";
		}

		const fishKeysEntries = ref<FishKeyEntry[]>([]);

		// Parse fishKeys object into table entries
		const parseFishKeys = (
			input: Record<string, string> | undefined,
			modeInput: Record<string, "ecb" | "cbc"> | undefined
		): FishKeyEntry[] => {
			if (!input || Object.keys(input).length === 0) {
				return [{target: "", key: "", mode: "ecb"}];
			}

			const entries: FishKeyEntry[] = [];

			for (const [target, key] of Object.entries(input)) {
				const mode = modeInput?.[target] || "ecb";
				entries.push({target, key: String(key ?? ""), mode});
			}

			return entries.length > 0 ? entries : [{target: "", key: "", mode: "ecb"}];
		};

		// Convert table entries into mapping object
		const fishKeysValue = computed(() => {
			const map: Record<string, string> = {};

			for (const entry of fishKeysEntries.value) {
				const target = entry.target.trim();
				const key = entry.key.trim();

				if (target && key) {
					map[target] = key;
				}
			}

			return map;
		});

		// Convert table entries into mode mapping object
		const fishKeyModesValue = computed(() => {
			const map: Record<string, "ecb" | "cbc"> = {};

			for (const entry of fishKeysEntries.value) {
				const target = entry.target.trim();

				if (target) {
					map[target] = entry.mode;
				}
			}

			return map;
		});

		// Initialize entries from defaults
		watch(
			() => [props.defaults.fishKeys, props.defaults.fishKeyModes],
			([keys, modes]) => {
				fishKeysEntries.value = parseFishKeys(keys, modes);
			},
			{immediate: true}
		);

		const addFishKeyEntry = () => {
			fishKeysEntries.value.push({target: "", key: "", mode: "ecb"});
		};

		const removeFishKeyEntry = (index: number) => {
			if (fishKeysEntries.value.length > 1) {
				fishKeysEntries.value.splice(index, 1);
			}
		};

		// Nick Encoding table management
		interface EncodingEntry {
			nick: string;
			encoding: string;
		}

		const encodingEntries = ref<EncodingEntry[]>([]);

		const parseEncodingMap = (input: Record<string, string> | undefined): EncodingEntry[] => {
			if (!input || Object.keys(input).length === 0) {
				return [];
			}

			return Object.entries(input).map(([nick, encoding]) => ({nick, encoding}));
		};

		const encodingMapValue = computed(() => {
			const map: Record<string, string> = {};

			for (const entry of encodingEntries.value) {
				const nick = entry.nick.trim().toLowerCase();
				const encoding = entry.encoding.trim().toLowerCase();

				if (nick && encoding) {
					map[nick] = encoding;
				}
			}

			return map;
		});

		watch(
			() => props.defaults.encodingMap,
			(newValue) => {
				encodingEntries.value = parseEncodingMap(newValue);
			},
			{immediate: true}
		);

		const addEncodingEntry = () => {
			encodingEntries.value.push({nick: "", encoding: ""});
		};

		const removeEncodingEntry = (index: number) => {
			encodingEntries.value.splice(index, 1);
		};

		const onSubmit = (event: Event) => {
			const formData = new FormData(event.target as HTMLFormElement);
			const data: Partial<ClientNetwork> = {};

			formData.forEach((value, key) => {
				data[key] = value;
			});

			props.handleSubmit({
				...data,
				fishKeys: fishKeysValue.value,
				fishKeyModes: fishKeyModesValue.value,
				encodingMap: encodingMapValue.value,
			} as ClientNetwork);
		};

		return {
			store,
			config,
			displayPasswordField,
			publicPassword,
			commandsInput,
			resizeCommandsInput,
			setSaslAuth,
			usernameInput,
			onNickChanged,
			onSubmit,
			fishKeysEntries,
			fishKeysValue,
			addFishKeyEntry,
			removeFishKeyEntry,
			encodingEntries,
			encodingMapValue,
			addEncodingEntry,
			removeEncodingEntry,
		};
	},
});
</script>
