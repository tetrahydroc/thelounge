<template>
	<div
		:id="'msg-' + prettyMessage.id"
		:class="[
			'msg',
			{
				self: prettyMessage.self,
				highlight: prettyMessage.highlight,
				'is-focused': isFocused,
				'previous-source': isPreviousSource,
			},
		]"
		:data-type="prettyMessage.type"
		:data-command="prettyMessage.command"
		:data-from="
			prettyMessage.from &&
			(prettyMessage.from.shoutbox
				? prettyMessage.from.original_nick
				: prettyMessage.from.nick)
		"
		:data-bridged="prettyMessage.from?.shoutbox"
	>
		<span
			aria-hidden="true"
			:aria-label="messageTimeLocale"
			class="time tooltipped tooltipped-e"
			>{{ `${messageTime}&#32;` }}
		</span>
		<template v-if="prettyMessage.type === 'unhandled'">
			<span class="from">[{{ prettyMessage.command }}]</span>
			<span class="content">
				<span v-for="(param, id) in prettyMessage.params" :key="id">{{
					`&#32;${param}&#32;`
				}}</span>
			</span>
		</template>
		<template v-else-if="isAction()">
			<span class="from"><span class="only-copy" aria-hidden="true">***&nbsp;</span></span>
			<component :is="messageComponent" :network="network" :message="prettyMessage" />
		</template>
		<template v-else-if="prettyMessage.type === 'action'">
			<span class="from"><span class="only-copy">*&nbsp;</span></span>
			<span class="content" dir="auto">
				<Username
					:user="prettyMessage.from"
					:network="network"
					:channel="channel"
					dir="auto"
				/>&#32;<ParsedMessage :message="prettyMessage" />
				<LinkPreview
					v-for="preview in prettyMessage.previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
		<template v-else>
			<span v-if="prettyMessage.type === 'message'" class="from">
				<template v-if="prettyMessage.from && prettyMessage.from.nick">
					<span class="only-copy" aria-hidden="true">&lt;</span>
					<Username :user="prettyMessage.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">&gt;&nbsp;</span>
				</template>
			</span>
			<span v-else-if="prettyMessage.type === 'plugin'" class="from">
				<template v-if="prettyMessage.from && prettyMessage.from.nick">
					<span class="only-copy" aria-hidden="true">[</span>
					{{ prettyMessage.from.nick }}
					<span class="only-copy" aria-hidden="true">]&nbsp;</span>
				</template>
			</span>
			<span v-else class="from">
				<template v-if="prettyMessage.from && prettyMessage.from.nick">
					<span class="only-copy" aria-hidden="true">-</span>
					<Username :user="prettyMessage.from" :network="network" :channel="channel" />
					<span class="only-copy" aria-hidden="true">-&nbsp;</span>
				</template>
			</span>
			<span class="content" dir="auto">
				<span
					v-if="prettyMessage.showInActive"
					aria-label="This message was shown in your active channel"
					class="msg-shown-in-active tooltipped tooltipped-e"
					><span></span
				></span>
				<span
					v-if="prettyMessage.statusmsgGroup"
					:aria-label="`This message was only shown to users with ${prettyMessage.statusmsgGroup} mode`"
					class="msg-statusmsg tooltipped tooltipped-e"
					><span>{{ prettyMessage.statusmsgGroup }}</span></span
				>
				<ParsedMessage :network="network" :message="prettyMessage" />
				<LinkPreview
					v-for="preview in prettyMessage.previews"
					:key="preview.link"
					:keep-scroll-position="keepScrollPosition"
					:link="preview"
					:channel="channel"
				/>
			</span>
		</template>
	</div>
</template>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import dayjs from "dayjs";

import constants from "../js/constants";
import localetime from "../js/helpers/localetime";
import Username from "./Username.vue";
import LinkPreview from "./LinkPreview.vue";
import ParsedMessage from "./ParsedMessage.vue";
import MessageTypes from "./MessageTypes";

import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";
import {useStore} from "../js/store";
import {MessageType} from "../../shared/types/msg";
import {parser as shoutboxParser} from "../js/helpers/shoutbox-bridge/parser";
import {ChanType} from "../../shared/types/chan";

MessageTypes.ParsedMessage = ParsedMessage;
MessageTypes.LinkPreview = LinkPreview;
MessageTypes.Username = Username;

export default defineComponent({
	name: "Message",
	components: MessageTypes,
	props: {
		message: {type: Object as PropType<ClientMessage>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: false},
		network: {type: Object as PropType<ClientNetwork>, required: true},
		keepScrollPosition: Function as PropType<() => void>,
		isPreviousSource: Boolean,
		isFocused: Boolean,
	},
	setup(props) {
		const store = useStore();

		const timeFormat = computed(() => {
			let format: keyof typeof constants.timeFormats;

			if (store.state.settings.use12hClock) {
				format = store.state.settings.showSeconds ? "msg12hWithSeconds" : "msg12h";
			} else {
				format = store.state.settings.showSeconds ? "msgWithSeconds" : "msgDefault";
			}

			return constants.timeFormats[format];
		});

		const messageTime = computed(() => {
			return dayjs(props.message.time).format(timeFormat.value);
		});

		const messageTimeLocale = computed(() => {
			return localetime(props.message.time);
		});

		const messageComponent = computed(() => {
			return "message-" + (props.message.type || "invalid"); // TODO: force existence of type in sharedmsg
		});

		const isAction = () => {
			if (!props.message.type) {
				return false;
			}

			return typeof MessageTypes["message-" + props.message.type] !== "undefined";
		};

		// IRC Bridge formatter
		const prettyMessage = computed(() => {
			if (
				props.channel?.type !== ChanType.CHANNEL ||
				!store.state.settings.beautifyBridgedMessages ||
				props.message.type !== MessageType.MESSAGE
			) {
				return props.message;
			}

			return shoutboxParser(props.message);
		});

		return {
			timeFormat,
			prettyMessage,
			messageTime,
			messageTimeLocale,
			messageComponent,
			isAction,
		};
	},
});
</script>
