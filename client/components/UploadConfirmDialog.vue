<template>
	<div id="upload-confirm-dialog-overlay" :class="{opened: !!data}">
		<div v-if="data !== null" id="upload-confirm-dialog">
			<div class="dialog-header">
				<span class="dialog-icon">📤</span>
				<span class="dialog-title">Upload Files</span>
			</div>

			<div class="dialog-body">
				<div class="file-section">
					<div class="section-label">{{ data.files.length }} file(s) selected</div>
					<ul class="file-list">
						<li v-for="(file, index) in data.files" :key="index">
							<span class="file-icon">📄</span>
							<span class="file-name">{{ file.name }}</span>
							<span class="file-size">{{ formatSize(file.size) }}</span>
						</li>
					</ul>
				</div>

				<div class="options-section">
					<div class="section-label">Options</div>

					<label class="option-row">
						<input
							id="upload-bundle"
							v-model="bundle"
							type="checkbox"
							class="checkbox"
						/>
						<span class="option-content">
							<span class="option-title">Bundle into ZIP</span>
							<span class="option-description"
								>Combine all files into a single archive</span
							>
						</span>
					</label>

					<div v-if="bundle" class="sub-option">
						<label for="upload-bundle-name" class="input-label">Archive name</label>
						<input
							id="upload-bundle-name"
							v-model="bundleName"
							type="text"
							class="text-input"
							placeholder="files.zip"
							@keyup.enter="confirm"
						/>
					</div>

					<label class="option-row">
						<input
							id="upload-encrypt"
							v-model="encrypt"
							type="checkbox"
							class="checkbox"
						/>
						<span class="option-content">
							<span class="option-title">Encrypt with password</span>
							<span class="option-description"
								>Protect the archive with AES-256 encryption</span
							>
						</span>
					</label>

					<div v-if="encrypt" class="sub-option">
						<label for="upload-password" class="input-label">Password</label>
						<input
							id="upload-password"
							v-model="password"
							type="password"
							class="text-input"
							placeholder="Enter password"
							@keyup.enter="confirm"
						/>
					</div>
				</div>

				<div v-if="encrypt && !bundle && data.files.length > 1" class="info-banner">
					💡 Each file will be encrypted separately into its own ZIP archive.
				</div>
			</div>

			<div class="dialog-footer">
				<button class="btn btn-cancel" @click="close(null)">Cancel</button>
				<button class="btn btn-primary" @click="confirm">
					Upload{{ bundle || encrypt ? " as ZIP" : "" }}
				</button>
			</div>
		</div>
	</div>
</template>

<style>
#upload-confirm-dialog-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	z-index: 9999;
	background: rgb(0 0 0 / 60%);
	display: none;
	align-items: center;
	justify-content: center;
	backdrop-filter: blur(2px);
}

#upload-confirm-dialog-overlay.opened {
	display: flex;
}

#upload-confirm-dialog {
	background: var(--body-bg-color);
	color: var(--body-color);
	margin: 10px;
	border-radius: 12px;
	max-width: 480px;
	width: 100%;
	box-shadow: 0 8px 32px rgb(0 0 0 / 40%);
	overflow: hidden;
}

/* Header */
#upload-confirm-dialog .dialog-header {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 16px 20px;
	border-bottom: 1px solid rgb(128 128 128 / 20%);
}

#upload-confirm-dialog .dialog-icon {
	font-size: 24px;
}

#upload-confirm-dialog .dialog-title {
	font-size: 18px;
	font-weight: 600;
}

/* Body */
#upload-confirm-dialog .dialog-body {
	padding: 16px 20px;
	max-height: 60vh;
	overflow-y: auto;
}

#upload-confirm-dialog .section-label {
	font-size: 12px;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	opacity: 0.6;
	margin-bottom: 8px;
}

/* File List */
#upload-confirm-dialog .file-section {
	margin-bottom: 20px;
}

#upload-confirm-dialog .file-list {
	list-style: none;
	margin: 0;
	padding: 0;
	background: rgb(128 128 128 / 10%);
	border-radius: 8px;
	max-height: 120px;
	overflow-y: auto;
}

#upload-confirm-dialog .file-list li {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	border-bottom: 1px solid rgb(128 128 128 / 10%);
}

#upload-confirm-dialog .file-list li:last-child {
	border-bottom: none;
}

#upload-confirm-dialog .file-icon {
	font-size: 14px;
	flex-shrink: 0;
}

#upload-confirm-dialog .file-name {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 13px;
}

#upload-confirm-dialog .file-size {
	font-size: 12px;
	opacity: 0.6;
	flex-shrink: 0;
}

/* Options */
#upload-confirm-dialog .options-section {
	margin-bottom: 16px;
}

#upload-confirm-dialog .option-row {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px;
	margin-bottom: 4px;
	border-radius: 8px;
	cursor: pointer;
	transition: background 0.15s ease;
}

#upload-confirm-dialog .option-row:hover {
	background: rgb(128 128 128 / 10%);
}

#upload-confirm-dialog .checkbox {
	width: 18px;
	height: 18px;
	margin: 2px 0 0 0;
	cursor: pointer;
	accent-color: var(--button-color);
}

#upload-confirm-dialog .option-content {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

#upload-confirm-dialog .option-title {
	font-size: 14px;
	font-weight: 500;
}

#upload-confirm-dialog .option-description {
	font-size: 12px;
	opacity: 0.6;
}

#upload-confirm-dialog .sub-option {
	margin: 0 0 12px 42px;
}

#upload-confirm-dialog .input-label {
	display: block;
	font-size: 12px;
	font-weight: 500;
	margin-bottom: 6px;
}

#upload-confirm-dialog .text-input {
	width: 100%;
	padding: 10px 12px;
	font-size: 14px;
	background: whitesmoke;
	border: 1px solid rgb(128 128 128 / 30%);
	border-radius: 6px;
	color: black;
	transition:
		border-color 0.15s ease,
		box-shadow 0.15s ease;
}

#upload-confirm-dialog .text-input:focus {
	outline: none;
	border-color: var(--button-color);
	box-shadow: 0 0 0 3px rgb(68 138 255 / 20%);
}

#upload-confirm-dialog .text-input::placeholder {
	opacity: 0.5;
}

/* Info Banner */
#upload-confirm-dialog .info-banner {
	padding: 10px 12px;
	background: rgb(59 130 246 / 15%);
	border-radius: 6px;
	font-size: 12px;
}

/* Footer */
#upload-confirm-dialog .dialog-footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 16px 20px;
	background: rgb(128 128 128 / 8%);
}

#upload-confirm-dialog .dialog-footer .btn {
	padding: 10px 20px;
	border-radius: 6px;
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.15s ease;
}

#upload-confirm-dialog .dialog-footer .btn-cancel {
	background: transparent;
	border: 1px solid rgb(128 128 128 / 40%);
	color: inherit;
}

#upload-confirm-dialog .dialog-footer .btn-cancel:hover {
	background: rgb(128 128 128 / 15%);
}

#upload-confirm-dialog .dialog-footer .btn-primary {
	background: var(--button-color);
	border: none;
	color: white;
}

#upload-confirm-dialog .dialog-footer .btn-primary:hover {
	filter: brightness(1.1);
}
</style>

<script lang="ts">
import eventbus from "../js/eventbus";
import {defineComponent, onMounted, onUnmounted, ref} from "vue";

type UploadConfirmDialogData = {
	files: File[];
};

type UploadConfirmDialogResult = {
	password: string;
	bundle: boolean;
	bundleName: string;
} | null;

type UploadConfirmDialogCallback = {
	(result: UploadConfirmDialogResult): void;
};

export default defineComponent({
	name: "UploadConfirmDialog",
	setup() {
		const data = ref<UploadConfirmDialogData | null>(null);
		const callback = ref<UploadConfirmDialogCallback>();
		const password = ref("");
		const bundle = ref(false);
		const bundleName = ref("");
		const encrypt = ref(false);

		const open = (incoming: UploadConfirmDialogData, cb: UploadConfirmDialogCallback) => {
			data.value = incoming;
			callback.value = cb;
			password.value = "";
			bundle.value = false;
			bundleName.value = "";
			encrypt.value = false;
		};

		const close = (result: UploadConfirmDialogResult) => {
			data.value = null;

			if (callback.value) {
				callback.value(result);
			}
		};

		const confirm = () => {
			close({
				password: encrypt.value ? password.value : "",
				bundle: bundle.value,
				bundleName: bundleName.value || "files.zip",
			});
		};

		const formatSize = (bytes: number) => {
			if (bytes === 0) return "0 B";
			const k = 1024;
			const sizes = ["B", "KB", "MB", "GB", "TB"];
			const i = Math.floor(Math.log(bytes) / Math.log(k));
			return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
		};

		const onEscape = () => {
			if (data.value) {
				close(null);
			}
		};

		onMounted(() => {
			eventbus.on("escapekey", onEscape);
			eventbus.on("upload-confirm-dialog", <(...evt: unknown[]) => void>open);
		});

		onUnmounted(() => {
			eventbus.off("escapekey", onEscape);
			eventbus.off("upload-confirm-dialog", <(...evt: unknown[]) => void>open);
		});

		return {
			data,
			password,
			bundle,
			bundleName,
			encrypt,
			close,
			confirm,
			formatSize,
		};
	},
});
</script>
