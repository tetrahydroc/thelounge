<template>
	<aside
		ref="userlist"
		class="userlist"
		:aria-label="'User list for ' + channel.name"
		@mouseleave="removeHoverUser"
	>
		<div class="count">
			<input
				ref="input"
				:value="userSearchInput"
				:placeholder="
					channel.users.length + ' user' + (channel.users.length === 1 ? '' : 's')
				"
				type="search"
				class="search"
				aria-label="Search among the user list"
				tabindex="-1"
				@input="setUserSearchInput"
				@keydown.up="navigateUserList($event, -1)"
				@keydown.down="navigateUserList($event, 1)"
				@keydown.page-up="navigateUserList($event, -10)"
				@keydown.page-down="navigateUserList($event, 10)"
				@keydown.enter="selectUser"
			/>
		</div>
		<div class="names">
			<!-- Custom groups from SPGROUPS -->
			<template v-if="hasCustomGroups">
				<div
					v-for="(users, group) in groupedUsers"
					:key="'group-' + group"
					:class="['user-mode', 'custom-group', 'group-' + getGroupSlug(group)]"
				>
					<div
						v-if="users.length > 0"
						:class="['custom-group-header', 'group-header-' + getGroupSlug(group)]"
					>
						{{ group }}
					</div>
					<template v-if="userSearchInput.length > 0">
						<!-- eslint-disable vue/no-v-text-v-html-on-component -->
						<Username
							v-for="user in users"
							:key="user.original!.nick + '-search'"
							:on-hover="hoverUser"
							:active="user.original === activeUser"
							:user="user.original!"
							v-html="user.string"
						/>
						<!-- eslint-enable -->
					</template>
					<template v-else>
						<Username
							v-for="user in users"
							:key="user.nick"
							:on-hover="hoverUser"
							:active="user === activeUser"
							:user="user"
						/>
					</template>
				</div>
			</template>
			<!-- Default IRC modes fallback -->
			<template v-else>
				<div
					v-for="(users, mode) in groupedUsers"
					:key="mode"
					:class="['user-mode', getModeClass(String(mode))]"
				>
					<template v-if="userSearchInput.length > 0">
						<!-- eslint-disable vue/no-v-text-v-html-on-component -->
						<Username
							v-for="user in users"
							:key="user.original.nick + '-search'"
							:on-hover="hoverUser"
							:active="user.original === activeUser"
							:user="user.original"
							v-html="user.string"
						/>
						<!-- eslint-enable -->
					</template>
					<template v-else>
						<Username
							v-for="user in users"
							:key="user.nick"
							:on-hover="hoverUser"
							:active="user === activeUser"
							:user="user"
						/>
					</template>
				</div>
			</template>
		</div>
	</aside>
</template>

<style lang="css">
.custom-group-header {
	background: var(--window-bg-color);
	color: var(--body-color-muted);
	display: flex;
	font-weight: 700;
	padding: 8px 14px 8px 10px;
	position: sticky;
	top: 0;

	&::before {
		font-weight: 900;
		font-family: "Font Awesome 6 Pro";
		display: var(--fa-display, inline-block);
		font-style: normal;
		font-variant: normal;
		text-rendering: auto;
		margin-right: 6px;
		align-self: center;
	}

	&::after {
		content: "";
		height: 1px;
		background: currentColor;
		margin: 0 0 0 10px;
		opacity: 0.5;
		flex-grow: 1;
		align-self: center;
	}
}
</style>

<script lang="ts">
import {filter as fuzzyFilter} from "fuzzy";
import {computed, defineComponent, nextTick, PropType, ref} from "vue";
import type {UserInMessage} from "../../shared/types/msg";
import type {ClientChan, ClientUser} from "../js/types";
import Username from "./Username.vue";
import {useStore} from "../js/store";

const modes = {
	"~": "owner",
	"&": "admin",
	"!": "admin",
	"@": "op",
	"%": "half-op",
	"+": "voice",
	"": "normal",
};

export default defineComponent({
	name: "ChatUserList",
	components: {
		Username,
	},
	props: {
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		const store = useStore();
		const userSearchInput = ref("");
		const activeUser = ref<UserInMessage | null>();
		const userlist = ref<HTMLDivElement>();

		// Check if we have custom groups from SPGROUPS
		const hasCustomGroups = computed(() => {
			return (
				store.state.settings.enhancedUserListEnabled &&
				props.channel.groups &&
				props.channel.groups.length > 0
			);
		});

		const filteredUsers = computed(() => {
			if (!userSearchInput.value) {
				return;
			}

			return fuzzyFilter(userSearchInput.value, props.channel.users, {
				pre: "<b>",
				post: "</b>",
				extract: (u) => u.nick,
			});
		});

		// CSS safe group name cache
		const groupNameSlugs = new Map<string, string>();

		// Convert group to CSS-safe name
		const slugify = (group: string) => {
			if (groupNameSlugs.has(group)) return;

			const groupNormalized = group.toLowerCase().replace(/[^a-z0-9]+/g, "-");
			const groupCSSSafe = groupNormalized.replace(/^-|-$/g, "");

			return groupNameSlugs.set(group, groupCSSSafe);
		};

		// Get CSS-safe group name
		const getGroupSlug = (group: string) => {
			return groupNameSlugs.get(group) ?? slugify(group);
		};

		const customGroupedUsers = computed(() => {
			const groups = {};

			if (hasCustomGroups.value) {
				if (userSearchInput.value && filteredUsers.value) {
					const filtered = filteredUsers.value.filter((user) => user.original.nick);

					for (const {name, users} of props.channel.groups ?? []) {
						groups[name] ??= [];
						slugify(name);

						for (const user of filtered) {
							if (!users.includes(user.original.nick)) {
								continue;
							}

							groups[name].push(user);
						}
					}
				} else {
					for (const {name, users} of props.channel.groups ?? []) {
						groups[name] ??= [];
						slugify(name);

						for (const user of props.channel.users) {
							if (!users.includes(user.nick)) {
								continue;
							}

							groups[name].push(user);
						}
					}
				}
			}

			return groups as {
				[group: string]: (ClientUser & {
					original: UserInMessage;
					string: string;
				})[];
			};
		});

		const standardGroupedUsers = computed(() => {
			const groups = {};

			if (!hasCustomGroups.value) {
				if (userSearchInput.value && filteredUsers.value) {
					const result = filteredUsers.value;

					for (const user of result) {
						const mode: string = user.original.modes[0] || "";
						groups[mode] ??= [];

						// Prepend user mode to search result
						user.string = mode + user.string;
						groups[mode].push(user);
					}
				} else {
					for (const user of props.channel.users) {
						const mode = user.modes[0] || "";

						groups[mode] ??= [];
						groups[mode].push(user);
					}
				}
			}

			return groups as {
				[mode: string]: (ClientUser & {
					original: UserInMessage;
					string: string;
				})[];
			};
		});

		const groupedUsers = computed(() => {
			return hasCustomGroups.value ? customGroupedUsers.value : standardGroupedUsers.value;
		});

		const setUserSearchInput = (e: Event) => {
			userSearchInput.value = (e.target as HTMLInputElement).value;
		};

		const getModeClass = (mode: string) => {
			return modes[mode] as typeof modes;
		};

		const selectUser = () => {
			// Simulate a click on the active user to open the context menu.
			// Coordinates are provided to position the menu correctly.
			if (!activeUser.value || !userlist.value) {
				return;
			}

			const el = userlist.value.querySelector(".active");

			if (!el) {
				return;
			}

			const rect = el.getBoundingClientRect();
			const ev = new MouseEvent("click", {
				view: window,
				bubbles: true,
				cancelable: true,
				clientX: rect.left,
				clientY: rect.top + rect.height,
			});
			el.dispatchEvent(ev);
		};

		const hoverUser = (user: UserInMessage) => {
			activeUser.value = user;
		};

		const removeHoverUser = () => {
			activeUser.value = null;
		};

		const scrollToActiveUser = () => {
			// Scroll the list if needed after the active class is applied
			void nextTick(() => {
				const el = userlist.value?.querySelector(".active");
				el?.scrollIntoView({block: "nearest", inline: "nearest"});
			});
		};

		const navigateUserList = (event: Event, direction: number) => {
			// Prevent propagation to stop global keybind handler from capturing pagedown/pageup
			// and redirecting it to the message list container for scrolling
			event.stopImmediatePropagation();
			event.preventDefault();

			let users = props.channel.users;

			// Only using filteredUsers when we have to avoids filtering when it's not needed
			if (userSearchInput.value && filteredUsers.value) {
				users = filteredUsers.value.map((result) => result.original);
			}

			// Bail out if there's no users to select
			if (!users.length) {
				activeUser.value = null;
				return;
			}

			const abort = () => {
				activeUser.value = direction ? users[0] : users[users.length - 1];
				scrollToActiveUser();
			};

			// If there's no active user select the first or last one depending on direction
			if (!activeUser.value) {
				abort();
				return;
			}

			let currentIndex = users.indexOf(activeUser.value as ClientUser);

			if (currentIndex === -1) {
				abort();
				return;
			}

			currentIndex += direction;

			// Wrap around the list if necessary. Normaly each loop iterates once at most,
			// but might iterate more often if pgup or pgdown are used in a very short user list
			while (currentIndex < 0) {
				currentIndex += users.length;
			}

			while (currentIndex > users.length - 1) {
				currentIndex -= users.length;
			}

			activeUser.value = users[currentIndex];
			scrollToActiveUser();
		};

		return {
			filteredUsers,
			groupedUsers,
			hasCustomGroups,
			userSearchInput,
			activeUser,
			userlist,
			getGroupSlug,
			setUserSearchInput,
			getModeClass,
			selectUser,
			hoverUser,
			removeHoverUser,
			navigateUserList,
		};
	},
});
</script>
