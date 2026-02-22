import {PluginInputHandler} from "./index.js";
import {createFishMessage, type FishMode} from "../../utils/fish.js";
import Config from "../../config.js";

const commands = ["notice"];

const input: PluginInputHandler = function (network, chan, cmd, args) {
	if (!args[1]) {
		return;
	}

	let targetName = args[0];
	let message = args.slice(1).join(" ");

	// Encrypt if a FiSH key is set for the target channel/query

	if (Config.values.fish.enabled) {
		const targetChan =
			network.getChannel(targetName) || (chan.name === targetName ? chan : undefined);
		const key = targetChan?.blowfishKey;
		const mode: FishMode = targetChan?.blowfishMode || "ecb";
		message = key ? createFishMessage(message, key, mode) : message;
	}

	// If the IRCd does not support echo-message, simulate the message
	// being sent back to us.
	if (!network.irc.network.cap.isEnabled("echo-message")) {
		let targetGroup;
		const parsedTarget = network.irc.network.extractTargetGroup(targetName);

		if (parsedTarget) {
			targetName = parsedTarget.target;
			targetGroup = parsedTarget.target_group;
		}

		const echoTargetChan = network.getChannel(targetName);

		if (typeof echoTargetChan === "undefined") {
			message = "{to " + args[0] + "} " + message;
		}

		network.irc.emit("notice", {
			nick: network.irc.user.nick,
			target: targetName,
			group: targetGroup,
			message: message,
		});
	}

	return true;
};

export default {
	commands,
	input,
};
