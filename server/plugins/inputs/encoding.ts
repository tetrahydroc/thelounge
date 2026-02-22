import {PluginInputHandler} from "./index.js";
import Msg from "../../models/msg.js";
import {MessageType} from "../../../shared/types/msg.js";
import Config from "../../config.js";
import iconv from "iconv-lite";

const commands = ["encoding"];

const input: PluginInputHandler = function (network, chan, _cmd, args) {
	if (!Config.values.encoding.enabled) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: "Encoding is not enabled on this server.",
			})
		);
		return;
	}

	if (!network.encodingMap) {
		network.encodingMap = {};
	}

	// /encoding → list all set nick encodings
	if (args.length === 0) {
		const entries = Object.entries(network.encodingMap);

		if (entries.length === 0) {
			chan.pushMessage(
				this,
				new Msg({
					type: MessageType.NOTICE,
					text: "No nick encodings set. Use: /encoding <nick> <encoding>",
				})
			);
		} else {
			const list = entries.map(([nick, enc]) => `${nick}: ${enc}`).join(", ");
			chan.pushMessage(
				this,
				new Msg({
					type: MessageType.NOTICE,
					text: `Nick encodings: ${list}`,
				})
			);
		}

		return;
	}

	const nick = args[0];
	const encodingArg = args[1]?.toLowerCase();

	// /encoding <nick> → show encoding for nick
	if (!encodingArg) {
		const current = network.encodingMap[nick.toLowerCase()] || "auto";
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.NOTICE,
				text: `Encoding for ${nick}: ${current}`,
			})
		);
		return;
	}

	// /encoding <nick> auto → reset to auto-detection
	if (encodingArg === "auto") {
		delete network.encodingMap[nick.toLowerCase()];
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.NOTICE,
				text: `Encoding for ${nick} reset to auto-detection.`,
			})
		);
		this.save();
		return;
	}

	// /encoding <nick> <encoding> → set encoding, validate with iconv-lite
	if (!iconv.encodingExists(encodingArg)) {
		chan.pushMessage(
			this,
			new Msg({
				type: MessageType.ERROR,
				text: `Unknown encoding "${encodingArg}". Any encoding supported by iconv-lite is valid (e.g. utf8, latin1, cp1252, iso-8859-2, cp437).`,
			})
		);
		return;
	}

	network.encodingMap[nick.toLowerCase()] = encodingArg;
	chan.pushMessage(
		this,
		new Msg({
			type: MessageType.NOTICE,
			text: `Encoding for ${nick} set to ${encodingArg}.`,
		})
	);
	this.save();
};

export default {
	commands,
	input,
	allowDisconnected: true,
};
