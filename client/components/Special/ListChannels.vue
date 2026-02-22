<template>
	<span v-if="channelData.text">{{ channelData.text }} </span>
	<table v-else class="channel-list">
		<thead>
			<tr>
				<th class="channel">Channel</th>
				<th class="users">Users</th>
				<th class="topic">Topic</th>
			</tr>
		</thead>
		<tbody>
			<tr v-for="chan in channelData" :key="chan.channel">
				<td class="channel"><ParsedMessage :network="network" :text="chan.channel" /></td>
				<td class="users">{{ chan.num_users }}</td>
				<td class="topic"><ParsedMessage :network="network" :text="chan.topic" /></td>
			</tr>
		</tbody>
	</table>
</template>

<script lang="ts">
import {defineComponent, PropType} from "vue";
import {ClientChan, ClientNetwork} from "../../js/types";
import ParsedMessage from "../ParsedMessage.vue";

export default defineComponent({
	name: "ListChannels",
	components: {
		ParsedMessage,
	},
	props: {
		network: {type: Object as PropType<ClientNetwork>, required: true},
		channel: {type: Object as PropType<ClientChan>, required: true},
	},
	setup(props) {
		return {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			channelData: props.channel.data as any,
		};
	},
});
</script>
