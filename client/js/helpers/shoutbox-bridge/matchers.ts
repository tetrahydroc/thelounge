import { type Matcher } from "./types/matcher";

/**
 * Matchers for shoutbox messages
 */
export const matchers: Matcher[] = [
	{
		type: "basic",
		name: "Aither",
		description: "[nick] message",
		matches: [ "chatbot" ],
		regex: /^\[(?<nick>[^:\]]+)\] (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "Anthelion",
		description: "[ SB ] (<nick>): <message>",
		matches: [ "sauron" ],
		regex: /^0 \[2 SB0 \] \((?<nick>[^):]+)\): (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "Aura4K",
		description: "[nick] message",
		matches: [ "aurarelay" ],
		regex: /^11\[04(?<nick>[^:\]]+?)11\] (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "BeyondHD",
		description: "[SB] <nick>: <message>",
		matches: [ "willie" ],
		regex: /^09\[SB\] (?<nick>[^:]+): (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "DarkPeers",
		description: "[nick] message",
		matches: [ "darkpeers" ],
		regex: /^\[(?<nick>[^:\]]+)\] (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "DigitalCore",
		description: "<<nick>> <message>",
		matches: [ "endor" ],
		regex: /^<(?<nick>[^>]+?)> (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "HomiesHelpDesk",
		description: "[nick]: message",
		matches: [ "bbot" ],
		regex: /^\[(?<nick>[^:\]]+)\](?: \(MTX\))?: (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "HUNO (Discord)",
		description: "»<nick> (<rank>)« <message> | »<nick>« <message>",
		matches: [ "mellos" ],
		regex: /^»(?<nick>[^«]+?)(?: (?:\p{RGI_Emoji}+|\(.+?\)))?« (?<content>.*)/v,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "advanced",
		name: "HUNO (Web)",
		description: "Nicks in the format '<nick>-web'",
		matches (nick) {
			return nick.endsWith("-web") || nick.endsWith("-web", nick.length - 2);
		},
		transform (message) {
			return {
				nick: message.from!.nick!.slice(0, -4),
				content: message.text
			};
		}
	},
	{
		type: "basic",
		name: "LST",
		description: "[nick] message",
		matches: [ "bot" ],
		regex: /^\[(?<nick>[^:\]]+)\] (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "Luminarr",
		description: "[nick] message",
		matches: [ "luminarr" ],
		regex: /^\[(?<nick>[^:\]]+)\] (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "OnlyEncodes+",
		description: "[nick] message",
		matches: [ "bridgebot" ],
		regex: /^\[(?<nick>[^:\]]+)\] (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "ReelFliX",
		description: "[Chatbox] <nick>: <message>",
		matches: [ "wall-e" ],
		regex: /^04\[Chatbox\] (?<nick>[^:]+): (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "RocketHD",
		description: "🛰️<nick>: <message>",
		matches: [ "rocketnouncer" ],
		regex: /^🛰️(?<nick>[^:]+?): (?<content>.*)/v,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "UploadCX",
		description: "[nick]: message",
		matches: [ "ulcx" ],
		regex: /^\[(?<nick>[^:\]]+)\]: (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
];

/**
 * Helper to get regex match groups with inferd types from return of parent
 */
function typedGroups <T = RegExpMatchArray['groups']> (regexMatch: RegExpMatchArray | null) {
	return regexMatch?.groups as T;
}
