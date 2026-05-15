<template>
	<div
		:id="'msg-' + prettyMessage.id"
		:class="[
			'msg',
			{
				self: prettyMessage.self,
				highlight: prettyMessage.highlight,
				'is-focused': isFocused,
				'previous-source': isPreviousSource
			},
		]"
		:data-type="prettyMessage.type"
		:data-command="prettyMessage.command"
		:data-from="prettyMessage.from && (prettyMessage.from.shoutbox ? prettyMessage.from.original_nick : prettyMessage.from.nick)"
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
			<span class="actions">
				<span v-if="canReply" class="reply-action">
					<button
						type="button"
						class="reply-button"
						aria-label="Reply to message"
						title="Reply to message"
						@click="replyToMessage"
					>
						<span aria-hidden="true">
							<i class="fas fa-reply" style="width: 35px;"></i>
						</span>
					</button>
				</span>
				<i v-for="(action, id) in messageActions" :key="id" :class="['msg-action', action.class]" @click="action.callback(prettyMessage)"></i>
			</span>
		</template>
	</div>
</template>

<style scoped>
#chat .msg .actions {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	margin-left: auto;
	opacity: 0;
	pointer-events: none;
	transition: opacity 0.15s ease;
	position: absolute;
	height: 25px;
	z-index: 1;
	top: -5px;
	right: 5px;
}

#chat .msg:hover .actions,
#chat .msg:focus-within .actions,
#chat .msg.is-focused .actions {
	opacity: 1;
	pointer-events: auto;
}

#chat .msg .reply-action {
	display: inline-flex;
	align-items: center;
}

#chat .msg .reply-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	line-height: 1;
	background: transparent;
	border: 0;
	color: inherit;
}

#chat .msg .reply-button:hover,
#chat .msg .reply-button:focus {
	color: var(--button-color);
	opacity: 1;
}
</style>

<script lang="ts">
import {computed, defineComponent, PropType} from "vue";
import dayjs from "dayjs";

import constants from "../js/constants";
import eventbus from "../js/eventbus";
import localetime from "../js/helpers/localetime";
import Username from "./Username.vue";
import LinkPreview from "./LinkPreview.vue";
import ParsedMessage from "./ParsedMessage.vue";
import MessageTypes from "./MessageTypes";

import type {ClientChan, ClientMessage, ClientNetwork} from "../js/types";
import {useStore} from "../js/store";
import { MessageType } from "../../shared/types/msg";
import { parser as shoutboxParser } from "../js/helpers/shoutbox-bridge/parser";
import { ChanType } from "../../shared/types/chan";

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
			if (props.channel?.type !== ChanType.CHANNEL || !store.state.settings.beautifyBridgedMessages || props.message.type !== MessageType.MESSAGE) {
				return props.message;
			}

			return shoutboxParser(props.message);
		});

		const canReply = computed(() => {
			return Boolean(prettyMessage.value.from?.nick && props.message.text);
		});

		const messageActions = computed(() => {
			return (
				prettyMessage.value as ClientMessage & {
					actions?: Array<{class: string; callback: (message: ClientMessage) => void}>;
				}
			).actions || [];
		});

		const replyToMessage = () => {
			const nick = prettyMessage.value.from?.nick;
			const content = prettyMessage.value.text;

			if (!nick || !content) {
				return;
			}

			eventbus.emit("message:reply", `\x02${nick}\x02: \x0314,99"\x1D${content}\x1D"\x03`);
		};

		return {
			timeFormat,
			prettyMessage,
			messageTime,
			messageTimeLocale,
			messageComponent,
			isAction,
			canReply,
			messageActions,
			replyToMessage,
		};
	},
});
</script>
