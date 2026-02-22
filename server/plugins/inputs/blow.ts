import {PluginInputHandler} from "./index.js";
import Msg from "../../models/msg.js";
import {MessageType} from "../../../shared/types/msg.js";
import type {FishMode} from "../../utils/fish.js";
import Config from "../../config.js";

const commands = ["blow"];

const input: PluginInputHandler = function (network, chan, _cmd, args) {
	if (!Config.values.fish.enabled) {
		return true;
	}

	if (!chan) {
		return true;
	}

	if (args.length === 0) {
		// Show current status
		if (chan.blowfishKey) {
			const mode = (chan.blowfishMode || "ecb").toUpperCase();
			chan.pushMessage(
				this,
				new Msg({
					type: MessageType.NOTICE,
					text: `FiSH: Key is set for ${chan.name} (${mode} mode). Use /blow off to clear.`,
				})
			);
		} else {
			chan.pushMessage(
				this,
				new Msg({
					type: MessageType.NOTICE,
					text: `FiSH: No key set for ${chan.name}. Use /blow <key> [ecb|cbc] to set.`,
				})
			);
		}

		return true;
	}

	const sub = args.join(" ").trim();

	if (!sub) {
		return true;
	}

	if (sub.toLowerCase() === "off" || sub.toLowerCase() === "clear") {
		// Persist the key removal to the network's fishKeys map
		const keyMap = network.fishKeys || {};
		delete keyMap[chan.name.toLowerCase()];
		network.fishKeys = keyMap;
		chan.blowfishKey = undefined;

		// Also remove the mode
		const modeMap = network.fishKeyModes || {};
		delete modeMap[chan.name.toLowerCase()];
		network.fishKeyModes = modeMap;
		chan.blowfishMode = undefined;

		this.save();

		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.NOTICE,
				text: `FiSH: Key cleared for ${chan.name}.`,
			})
		);
		return true;
	}

	// Parse key and optional mode
	// Usage: /blow <key> [ecb|cbc]
	const parts = sub.split(/\s+/);
	const key = parts[0];
	const modeArg = parts[1]?.toLowerCase();
	let mode: FishMode = "ecb"; // Default to ECB for backward compatibility

	if (modeArg === "cbc" || modeArg === "ecb") {
		mode = modeArg;
	} else if (modeArg && modeArg !== "") {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.NOTICE,
				text: `FiSH: Invalid mode "${modeArg}". Use "ecb" or "cbc".`,
			})
		);
		return true;
	}

	// Persist the key to the network's fishKeys map
	const keyMap = network.fishKeys || {};
	keyMap[chan.name.toLowerCase()] = key;
	network.fishKeys = keyMap;
	chan.blowfishKey = key;

	// Persist the mode to the network's fishKeyModes map
	const modeMap = network.fishKeyModes || {};
	modeMap[chan.name.toLowerCase()] = mode;
	network.fishKeyModes = modeMap;
	chan.blowfishMode = mode;

	this.save();

	const modeDisplay = mode.toUpperCase();
	chan.pushMessage(
		this,
		new Msg({
			type: MessageType.NOTICE,
			text: `FiSH: Key set for ${chan.name} (${modeDisplay} mode).`,
		})
	);
	return true;
};

export default {
	commands,
	input,
};
