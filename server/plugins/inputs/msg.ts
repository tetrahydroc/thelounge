import {PluginInputHandler} from "./index.js";
import Msg from "../../models/msg.js";
import Chan from "../../models/chan.js";
import {MessageType} from "../../../shared/types/msg.js";
import {ChanType} from "../../../shared/types/chan.js";
import {createFishMessage, type FishMode} from "../../utils/fish.js";
import Config from "../../config.js";

const commands = ["query", "msg", "say"];

function getTarget(cmd: string, args: string[], chan: Chan) {
	switch (cmd) {
		case "msg":
		case "query":
			return args.shift();
		default:
			return chan.name;
	}
}

const input: PluginInputHandler = function (network, chan, cmd, args) {
	let targetName = getTarget(cmd, args, chan);

	if (cmd === "query") {
		if (!targetName) {
			chan.pushMessage(
				this,
				new Msg({
					type: MessageType.ERROR,
					text: "You cannot open a query window without an argument.",
				})
			);
			return;
		}

		const target = network.getChannel(targetName);

		if (typeof target === "undefined") {
			const char = targetName[0];

			if (
				network.irc.network.options.CHANTYPES &&
				network.irc.network.options.CHANTYPES.includes(char)
			) {
				chan.pushMessage(
					this,
					new Msg({
						type: MessageType.ERROR,
						text: "You can not open query windows for channels, use /join instead.",
					})
				);
				return;
			}

			for (let i = 0; i < network.irc.network.options.PREFIX.length; i++) {
				if (network.irc.network.options.PREFIX[i].symbol === char) {
					chan.pushMessage(
						this,
						new Msg({
							type: MessageType.ERROR,
							text: "You can not open query windows for names starting with a user prefix.",
						})
					);
					return;
				}
			}

			const newChan = this.createChannel({
				type: ChanType.QUERY,
				name: targetName,
			});

			this.emit("join", {
				network: network.uuid,
				chan: newChan.getFilteredClone(true),
				shouldOpen: true,
				index: network.addChannel(newChan),
			});
			this.save();
			newChan.loadMessages(this, network);
		}
	}

	if (args.length === 0) {
		return true;
	}

	if (!targetName) {
		return true;
	}

	let msg = args.join(" ");

	if (msg.length === 0) {
		return true;
	}

	// Determine if we should encrypt using FiSH for this target
	if (Config.values.fish.enabled) {
		const targetChan =
			network.getChannel(targetName) || (chan.name === targetName ? chan : undefined);
		const key = targetChan?.blowfishKey;
		const mode: FishMode = targetChan?.blowfishMode || "ecb";
		msg = key ? createFishMessage(msg, key, mode) : msg;
	}

	network.irc.say(targetName, msg);

	// If the IRCd does not support echo-message, simulate the message
	// being sent back to us. Emit the same text we sent (encrypted or plain)
	// so that inbound pipeline can decrypt and store plaintext.
	if (!network.irc.network.cap.isEnabled("echo-message")) {
		const parsedTarget = network.irc.network.extractTargetGroup(targetName);
		let targetGroup: string | undefined = undefined;

		if (parsedTarget) {
			targetName = parsedTarget.target;
			targetGroup = parsedTarget.target_group;
		}

		const channel = network.getChannel(targetName);

		if (typeof channel !== "undefined") {
			network.irc.emit("privmsg", {
				nick: network.irc.user.nick,
				ident: network.irc.user.username,
				hostname: network.irc.user.host,
				target: targetName,
				group: targetGroup,
				message: msg,
			});
		}
	}

	return true;
};

export default {
	commands,
	input,
};
