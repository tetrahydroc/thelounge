import { type Matcher } from "./types/matcher";

/**
 * Matchers for shoutbox messages
 */
export const matchers: Matcher[] = [
	{
		type: "basic",
		name: "Anthelion",
		description: "[ SB ] (<nick>): <message>",
		matches: [ "sauron" ],
		regex: /^.*?\[.*?SB.*?\][^(]+\((?<nick>[^):]+)\):.+?(?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "BeyondHD + ReelFliX",
		description: "[SB] <nick>: <message> | [Chatbox] <nick>: <message>",
		matches: [ "willie", "wall-e" ],
		regex: /^.*?\[(?:SB|Chatbox)\][^\w]+(?<nick>[^:]+): (?<content>.*)/,
		transform (message) {
			return typedGroups(message.text!.match(this.regex));
		}
	},
	{
		type: "basic",
		name: "UploadCX + LST + OnlyEncodes+ + HomiesHelpDesk + Aither + DarkPeers + Luminarr + Aura4K",
		description: "[nick] message | [nick]: message | nick: message | nick message",
		matches: [ "ulcx", "bot", "bridgebot", "bbot", "chatbot", "darkpeers", "luminarr", "aurarelay" ],
		regex: /^\[?(?<nick>[^:\]]+)\]?:? (?<content>.*)/,
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
				nick: message.from!.nick!.slice(0, -4)
			};
		}
	},
];

/**
 * Helper to get regex match groups with inferd types from return of parent
 */
function typedGroups <T = RegExpMatchArray['groups']> (regexMatch: RegExpMatchArray | null) {
	return regexMatch?.groups as T;
}
