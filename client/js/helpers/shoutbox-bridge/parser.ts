import type {SharedMsg} from "../../../../shared/types/msg";
import {toRaw} from "vue";
import {matchers} from "./matchers";

/**
 * Parse message aganst `Matchers` and edit the Nick and Content based on `transform` results
 */
export function parser(originalMessage: SharedMsg) {
	const originalSender = originalMessage.from?.nick?.toLowerCase();

	if (!originalMessage.text || !originalSender) return originalMessage;

	const matcher = matchers.find((m) => {
		if (m.type === "basic") return m.matches.includes(originalSender);
		if (m.type === "advanced") return m.matches(originalSender);
	});
	if (!matcher) return originalMessage;

	const edit = matcher.transform(originalMessage);
	if (!edit || !edit.nick) return originalMessage;

	const message = structuredClone(toRaw(originalMessage));
	message.text = edit.content ?? message.text;
	message.from = {
		...message.from!,
		nick: sanitizeNick(edit.nick),
		mode: "",
		shoutbox: true,
		original_nick: originalSender,
	};

	return message;
}

/**
 * Helper to remove invalid chars from nick string
 */
function sanitizeNick(nick: string) {
	return nick.replaceAll(/[^0-9a-z_-|]/gi, "");
}
