<template>
	<div>
		<h2>Messages</h2>
		<div>
			<label class="opt">
				<input :checked="store.state.settings.motd" type="checkbox" name="motd" />
				Show <abbr title="Message Of The Day">MOTD</abbr>
			</label>
		</div>
		<div>
			<label class="opt">
				<input
					:checked="store.state.settings.showSeconds"
					type="checkbox"
					name="showSeconds"
				/>
				Include seconds in timestamp
			</label>
		</div>
		<div>
			<label class="opt">
				<input
					:checked="store.state.settings.use12hClock"
					type="checkbox"
					name="use12hClock"
				/>
				Use 12-hour timestamps
			</label>
		</div>
		<div>
			<label class="opt">
				<input
					:checked="store.state.settings.beautifyBridgedMessages"
					type="checkbox"
					name="beautifyBridgedMessages"
				/>
				Beautify supported bridged shoutbox messages
			</label>
			<div role="group" style="padding-left: 1.5rem">
				<label class="opt">
					<input
						:disabled="!store.state.settings.beautifyBridgedMessages || undefined"
						:checked="store.state.settings.bridgedMessageNicksStyle === 'parentheses'"
						type="radio"
						name="bridgedMessageNicksStyle"
						value="parentheses"
					/>
					Show bridged nicknames in parentheses
					<span
						class="tooltipped tooltipped-n tooltipped-no-delay"
						aria-label="example: (nick)"
					>
						<button class="extra-help" />
					</span>
				</label>
				<label class="opt">
					<input
						:disabled="!store.state.settings.beautifyBridgedMessages || undefined"
						:checked="store.state.settings.bridgedMessageNicksStyle === 'normal'"
						type="radio"
						name="bridgedMessageNicksStyle"
						value="normal"
					/>
					Show bridged nicknames like a normal user
					<span
						class="tooltipped tooltipped-n tooltipped-no-delay"
						aria-label="example: nick"
					>
						<button class="extra-help" />
					</span>
				</label>
			</div>
		</div>
		<div>
			<label class="opt">
				<input
					:checked="store.state.settings.disableMutedUnread"
					type="checkbox"
					name="disableMutedUnread"
				/>
				Don't show unread badges on muted channels
			</label>
		</div>
		<template v-if="store.state.serverConfiguration?.prefetch">
			<h2>Link previews</h2>
			<div>
				<label class="opt">
					<input :checked="store.state.settings.media" type="checkbox" name="media" />
					Auto-expand media
				</label>
			</div>
			<div>
				<label class="opt">
					<input :checked="store.state.settings.links" type="checkbox" name="links" />
					Auto-expand websites
				</label>
			</div>
		</template>
		<h2 id="label-status-messages">
			Status messages
			<span
				class="tooltipped tooltipped-n tooltipped-no-delay"
				aria-label="Joins, parts, quits, kicks, nick changes, and mode changes"
			>
				<button class="extra-help" />
			</span>
		</h2>
		<div role="group" aria-labelledby="label-status-messages">
			<label class="opt">
				<input
					:checked="store.state.settings.statusMessages === 'shown'"
					type="radio"
					name="statusMessages"
					value="shown"
				/>
				Show all status messages individually
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.statusMessages === 'condensed'"
					type="radio"
					name="statusMessages"
					value="condensed"
				/>
				Condense status messages together
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.statusMessages === 'hidden'"
					type="radio"
					name="statusMessages"
					value="hidden"
				/>
				Hide all status messages
			</label>
		</div>
		<h2>Layout</h2>
		<div>
			<label class="opt">
				<input
					:checked="store.state.settings.enhancedUserListEnabled"
					type="checkbox"
					name="enhancedUserListEnabled"
				/>
				Use enhanced user list when available
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.enhancedContextMenuEnabled"
					type="checkbox"
					name="enhancedContextMenuEnabled"
				/>
				Use enhanced context menu
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.showInputNick"
					type="checkbox"
					name="showInputNick"
				/>
				Show current nick in the input box
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.jumptoEabled"
					type="checkbox"
					name="jumptoEabled"
				/>
				Enable "Jump to" in sidebar
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.filterdmsEnabled"
					type="checkbox"
					name="filterdmsEnabled"
				/>
				Enable "Filter DMs" in DM section
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.showAllDMs"
					type="checkbox"
					name="showAllDMs"
				/>
				Always show all DM channels in sidebar
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.compactSidebar"
					type="checkbox"
					name="compactSidebar"
				/>
				Use compact sidebar on Desktop
			</label>
		</div>
		<h2>Visual Aids</h2>
		<div>
			<label class="opt">
				<input
					:checked="store.state.settings.coloredNicks"
					type="checkbox"
					name="coloredNicks"
				/>
				Enable colored nicknames
			</label>
			<label class="opt">
				<input
					:checked="store.state.settings.autocomplete"
					type="checkbox"
					name="autocomplete"
				/>
				Enable autocomplete
			</label>
		</div>
		<div>
			<label class="opt">
				<label for="nickPostfix" class="opt">
					Nick autocomplete postfix
					<span
						class="tooltipped tooltipped-n tooltipped-no-delay"
						aria-label="Nick autocomplete postfix (for example a comma)"
					>
						<button class="extra-help" />
					</span>
				</label>
				<input
					id="nickPostfix"
					:value="store.state.settings.nickPostfix"
					type="text"
					name="nickPostfix"
					class="input"
					placeholder="Nick autocomplete postfix (e.g. ', ')"
				/>
			</label>
		</div>

		<h2>Theme</h2>
		<div>
			<label for="theme-select" class="sr-only">Theme</label>
			<select
				id="theme-select"
				:value="store.state.settings.theme"
				name="theme"
				class="input"
			>
				<option
					v-for="theme in store.state.serverConfiguration?.themes"
					:key="theme.name"
					:value="theme.name"
				>
					{{ theme.displayName }}
				</option>
			</select>
		</div>

		<div>
			<h2>Custom Stylesheet</h2>
			<label for="user-specified-css-input" class="sr-only">
				Custom stylesheet. You can override any style with CSS here.
			</label>
			<textarea
				id="user-specified-css-input"
				:value="store.state.settings.userStyles"
				class="input"
				name="userStyles"
				placeholder="/* You can override any style with CSS here */"
			/>
		</div>
	</div>
</template>

<style>
textarea#user-specified-css-input {
	height: 100px;
}
</style>

<script lang="ts">
import {defineComponent} from "vue";
import {useStore} from "../../js/store";

export default defineComponent({
	name: "AppearanceSettings",
	setup() {
		const store = useStore();
		return {
			store,
		};
	},
});
</script>
