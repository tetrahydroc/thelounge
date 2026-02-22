<template>
	<span
		:class="['user', {[nickColor]: store.state.settings.coloredNicks}, {active: active}]"
		:data-name="user.nick"
		role="button"
		v-on="onHover ? {mouseenter: hover} : {}"
		@click.prevent="openContextMenu"
		@contextmenu.prevent="openContextMenu"
		><slot>{{ displayNick }} </slot></span
	>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import {UserInMessage} from "../../shared/types/msg";
import eventbus from "../js/eventbus";
import colorClass from "../js/helpers/colorClass";
import type {ClientChan, ClientNetwork} from "../js/types";
import {useStore} from "../js/store";
import {ChanState} from "../../shared/types/chan";

type UsernameUser = Partial<UserInMessage> & {
	mode?: string;
	nick: string;
};

export default defineComponent({
	name: "Username",
	props: {
		user: {
			// TODO: UserInMessage shouldn't be necessary here.
			type: Object as PropType<UsernameUser | UserInMessage>,
			required: true,
		},
		active: Boolean,
		onHover: {
			type: Function as PropType<(user: UserInMessage) => void>,
			required: false,
		},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: false},
	},
	setup(props) {
		const mode = computed(() => {
			// Message objects have a singular mode, but user objects have modes array
			if (props.user.modes) {
				return props.user.modes[0];
			}

			return props.user.mode;
		});

		// TODO: Nick must be ! because our user prop union includes UserInMessage
		const nickColor = computed(() => colorClass(props.user.nick));

		const hover = () => {
			if (props.onHover) {
				return props.onHover(props.user as UserInMessage);
			}

			return null;
		};

		const openContextMenu = (event: Event) => {
			eventbus.emit("contextmenu:user", {
				event: event,
				user: props.user,
				network: props.network,
				channel: props.channel,
			});
		};

		const store = useStore();

		// Add to autocomplete for bridged users (need to switch channel after connect if channel active on connect)
		if (
			store.state.settings.beautifyBridgedMessages &&
			props.user.shoutbox &&
			store.state.activeChannel?.channel.state === ChanState.JOINED &&
			!store.state.activeChannel?.channel.users.find((u) => u.nick === props.user.nick)
		) {
			store.state.activeChannel?.channel.users.push({
				nick: props.user.nick!,
				modes: [],
				lastMessage: Date.now(),
				mode: "",
				away: "",
			});
		}

		// Allow adjusting nick display via setting
		const displayNick = computed(() => {
			const umode = mode.value ?? "";
			const nick = props.user.nick!;

			if (
				store.state.settings.beautifyBridgedMessages &&
				props.user.shoutbox &&
				store.state.settings.bridgedMessageNicksStyle === "parentheses"
			) {
				return `(${umode}${nick})`;
			}

			return `${umode}${nick}`;
		});

		return {
			displayNick,
			mode,
			nickColor,
			hover,
			openContextMenu,
			store,
		};
	},
});
</script>
