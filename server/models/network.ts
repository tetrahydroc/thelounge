import _ from "lodash";
import {v4 as uuidv4} from "uuid";
import IrcFramework, {Client as IRCClient} from "irc-framework";
import Chan, {ChanConfig, Channel} from "./chan.js";
import Msg from "./msg.js";
import Prefix from "./prefix.js";
import Helper, {Hostmask} from "../helper.js";
import Config, {WebIRC} from "../config.js";
import STSPolicies from "../plugins/sts.js";
import ClientCertificate, {ClientCertificateType} from "../plugins/clientCertificate.js";
import Client from "../client.js";
import {MessageType} from "../../shared/types/msg.js";
import {ChanType} from "../../shared/types/chan.js";
import {SharedNetwork} from "../../shared/types/network.js";
import {encrypt, decrypt} from "../utils/secretCrypto.js";
import type {FishMode} from "../utils/fish.js";

type NetworkIrcOptions = {
	host: string;
	port: number;
	password: string;
	nick: string;
	username: string;
	gecos: string;
	tls: boolean;
	rejectUnauthorized: boolean;
	webirc: WebIRC | null;
	client_certificate: ClientCertificateType | null;
	socks?: {
		host: string;
		port: number;
		user: string;
		pass: string;
	};
	sasl_mechanism?: string;
	account?:
		| {
				account: string;
				password: string;
		  }
		| Record<string, never>;
};

type NetworkStatus = {
	connected: boolean;
	secure: boolean;
};

export type IgnoreListItem = Hostmask & {
	when: number;
};

type IgnoreList = IgnoreListItem[];

type NonNullableIRCWithOptions = NonNullable<IRCClient & {options: NetworkIrcOptions}>;

export type NetworkWithIrcFramework = Network & {
	irc: NonNullable<Network["irc"]> & {
		options: NonNullableIRCWithOptions;
	};
};

export type NetworkConfig = {
	nick: string;
	name: string;
	host: string;
	port: number;
	tls: boolean;
	userDisconnected: boolean;
	rejectUnauthorized: boolean;
	password: string;
	awayMessage: string;
	commands: string;
	username: string;
	realname: string;
	leaveMessage: string;
	sasl: string;
	saslAccount: string;
	saslPassword: string;
	channels: ChanConfig[];
	uuid: string;
	proxyHost: string;
	proxyPort: number;
	proxyUsername: string;
	proxyPassword: string;
	proxyEnabled: boolean;
	highlightRegex?: string;
	ignoreList: IgnoreListItem[];
	ftpEnabled: boolean;
	ftpHost: string;
	ftpPort: number;
	ftpUsername: string;
	ftpPassword: string;
	ftpTls: boolean;
	ftpAutoInvite: boolean;
};

// Form data coming from network create/edit forms
// All fields are optional as forms may not submit all fields
export type NetworkFormData = {
	uuid?: string;
	name?: string;
	host?: string;
	port?: string | number;
	tls?: boolean;
	userDisconnected?: boolean;
	rejectUnauthorized?: boolean;
	password?: string;
	nick?: string;
	username?: string;
	realname?: string;
	leaveMessage?: string;
	sasl?: string;
	saslAccount?: string;
	saslPassword?: string;
	commands?: string[] | string;
	channels?: ChanConfig[];
	ignoreList?: IgnoreListItem[];
	proxyEnabled?: boolean;
	proxyHost?: string;
	proxyPort?: string | number;
	proxyUsername?: string;
	proxyPassword?: string;
	join?: string; // backwards compatibility
	fishGlobalKey?: string;
	fishKeys?: Record<string, string>;
	fishGlobalKeyMode?: FishMode;
	fishKeyModes?: Record<string, FishMode>;
	ftpEnabled?: boolean;
	ftpHost?: string;
	ftpPort?: string | number;
	ftpUsername?: string;
	ftpPassword?: string;
	ftpTls?: boolean;
	ftpAutoInvite?: boolean;
};

class Network {
	nick!: string;
	name!: string;
	host!: string;
	port!: number;
	tls!: boolean;
	userDisconnected!: boolean;
	rejectUnauthorized!: boolean;
	password!: string;
	awayMessage!: string;
	commands!: string[];
	username!: string;
	realname!: string;
	leaveMessage!: string;
	sasl!: string;
	saslAccount!: string;
	saslPassword!: string;
	channels!: Chan[];
	uuid!: string;
	proxyHost!: string;
	proxyPort!: number;
	proxyUsername!: string;
	proxyPassword!: string;
	proxyEnabled!: boolean;
	highlightRegex?: RegExp;

	// FiSH Blowfish settings persisted per-network
	fishGlobalKey?: string;
	fishKeys?: Record<string, string>;
	fishGlobalKeyMode?: FishMode;
	fishKeyModes?: Record<string, FishMode>;

	// FTP Invite settings persisted per-network
	ftpEnabled?: boolean;
	ftpHost?: string;
	ftpPort?: number;
	ftpUsername?: string;
	ftpPassword?: string;
	ftpTls?: boolean;
	ftpAutoInvite?: boolean;

	// Per-channel/nick encoding map: channel/nick (lowercase) -> encoding
	encodingMap?: Record<string, string>;

	irc?: IrcFramework.Client & {
		options?: NetworkIrcOptions;
	};

	chanCache!: Chan[];
	ignoreList!: IgnoreList;
	keepNick!: string | null;

	status!: NetworkStatus;

	serverOptions!: {
		CHANTYPES: string[];
		PREFIX: Prefix;
		NETWORK: string;
	};

	// TODO: this is only available on export
	hasSTSPolicy!: boolean;

	constructor(attr?: Partial<Network>) {
		_.defaults(this, attr, {
			name: "",
			nick: "",
			host: "",
			port: 6667,
			tls: false,
			userDisconnected: false,
			rejectUnauthorized: false,
			password: "",
			awayMessage: "",
			commands: [],
			username: "",
			realname: "",
			leaveMessage: "",
			sasl: "",
			saslAccount: "",
			saslPassword: "",
			channels: [],
			irc: null,
			serverOptions: {
				CHANTYPES: ["#", "&"],
				PREFIX: new Prefix([
					{symbol: "!", mode: "Y"},
					{symbol: "@", mode: "o"},
					{symbol: "%", mode: "h"},
					{symbol: "+", mode: "v"},
				]),
				NETWORK: "",
			},

			proxyHost: "",
			proxyPort: 1080,
			proxyUsername: "",
			proxyPassword: "",
			proxyEnabled: false,

			// FiSH defaults
			fishGlobalKey: "",
			fishKeys: {},
			fishGlobalKeyMode: "ecb" as FishMode,
			fishKeyModes: {},

			// FTP defaults
			ftpEnabled: false,
			ftpHost: "",
			ftpPort: 21,
			ftpUsername: "",
			ftpPassword: "",
			ftpTls: false,
			ftpAutoInvite: false,

			// Encoding defaults
			encodingMap: {},

			chanCache: [],
			ignoreList: [],
			keepNick: null,
		});

		if (!this.uuid) {
			this.uuid = uuidv4();
		}

		if (!this.name) {
			this.name = this.host;
		}

		this.channels.unshift(
			new Chan({
				name: this.name,
				type: ChanType.LOBBY,
				// The lobby only starts as muted if every channel (unless it's special) is muted.
				// This is A) easier to implement and B) stops some confusion on startup.
				muted:
					this.channels.length >= 1 &&
					this.channels.every((chan) => chan.muted || chan.type === ChanType.SPECIAL),
			})
		);

		// Ensure FiSH keys are applied to any pre-existing channels loaded from disk
		if (Config.values.fish.enabled) {
			this.applyBlowKeysToChannels();
		}
	}

	validate(this: Network, client: Client) {
		// Remove !, :, @ and whitespace characters from nicknames and usernames
		const cleanNick = (str: string) => str.replace(/[\x00\s:!@]/g, "_").substring(0, 100);

		// Remove new lines and limit length
		const cleanString = (str: string) => str.replace(/[\x00\r\n]/g, "").substring(0, 300);

		this.setNick(cleanNick(String(this.nick || Config.getDefaultNick())));

		if (!this.username) {
			// If username is empty, make one from the provided nick
			this.username = this.nick.replace(/[^a-zA-Z0-9]/g, "");
		}

		this.username = cleanString(this.username) || "thelounge";
		this.realname = cleanString(this.realname) || this.nick;
		this.leaveMessage = cleanString(this.leaveMessage);
		// Decrypt any credentials that were encrypted at rest before further validation
		this.password = decrypt(this.password);
		this.saslPassword = decrypt(this.saslPassword);
		this.ftpPassword = decrypt(this.ftpPassword || "");

		this.password = cleanString(this.password);
		this.host = cleanString(this.host).toLowerCase();
		this.name = cleanString(this.name);
		this.saslAccount = cleanString(this.saslAccount);
		this.saslPassword = cleanString(this.saslPassword);

		this.proxyHost = cleanString(this.proxyHost);
		this.proxyPort = this.proxyPort || 1080;
		this.proxyUsername = cleanString(this.proxyUsername);
		this.proxyPassword = cleanString(this.proxyPassword);
		this.proxyEnabled = !!this.proxyEnabled;

		// FTP settings validation
		this.ftpHost = cleanString(this.ftpHost || "");
		this.ftpPort = this.ftpPort || 21;
		this.ftpUsername = cleanString(this.ftpUsername || "");
		this.ftpPassword = cleanString(this.ftpPassword || "");
		this.ftpEnabled = !!this.ftpEnabled;
		this.ftpTls = !!this.ftpTls;
		this.ftpAutoInvite = !!this.ftpAutoInvite;

		const error = function (network: Network, text: string) {
			network.getLobby().pushMessage(
				client,
				new Msg({
					type: MessageType.ERROR,
					text: text,
				}),
				true
			);
		};

		if (!this.port) {
			this.port = this.tls ? 6697 : 6667;
		}

		if (!["", "plain", "external"].includes(this.sasl)) {
			this.sasl = "";
		}

		if (Config.values.lockNetwork) {
			// This check is needed to prevent invalid user configurations
			if (
				!Config.values.public &&
				this.host &&
				this.host.length > 0 &&
				this.host !== Config.values.defaults.host
			) {
				error(this, `The hostname you specified (${this.host}) is not allowed.`);
				return false;
			}

			if (Config.values.public) {
				this.name = Config.values.defaults.name;
				// Sync lobby channel name
				this.getLobby().name = Config.values.defaults.name;
			}

			this.host = Config.values.defaults.host;
			this.port = Config.values.defaults.port;
			this.tls = Config.values.defaults.tls;
			this.rejectUnauthorized = Config.values.defaults.rejectUnauthorized;
		}

		if (this.host.length === 0) {
			error(this, "You must specify a hostname to connect.");
			return false;
		}

		const stsPolicy = STSPolicies.get(this.host);

		if (stsPolicy && !this.tls) {
			error(
				this,
				`${this.host} has an active strict transport security policy, will connect to port ${stsPolicy.port} over a secure connection.`
			);

			this.port = stsPolicy.port;
			this.tls = true;
			this.rejectUnauthorized = true;
		}

		return true;
	}

	createIrcFramework(this: NetworkWithIrcFramework, client: Client) {
		this.irc = new IrcFramework.Client({
			version: false, // We handle it ourselves
			outgoing_addr: Config.values.bind,
			enable_chghost: true,
			enable_echomessage: true,
			enable_setname: true,
			auto_reconnect: true,

			// Exponential backoff maxes out at 300 seconds after 9 reconnects,
			// it will keep trying for well over an hour (plus the timeouts)
			auto_reconnect_max_retries: 30,

			// TODO: this type should be set after setIrcFrameworkOptions
		}) as NetworkWithIrcFramework["irc"];

		this.setIrcFrameworkOptions(client);

		// Request custom capabilities
		const customCaps = [
			"znc.in/self-message", // Legacy echo-message for ZNC
			"znc.in/playback", // See http://wiki.znc.in/Playback
			"seedpool/enhanced", // THC enhanced client features
		];
		this.irc.requestCap(customCaps);
	}

	setIrcFrameworkOptions(this: NetworkWithIrcFramework, client: Client) {
		this.irc.options.host = this.host;
		this.irc.options.port = this.port;
		this.irc.options.password = this.password;
		this.irc.options.nick = this.nick;
		this.irc.options.username = Config.values.useHexIp
			? Helper.ip2hex(client.config.browser!.ip!)
			: this.username;
		this.irc.options.gecos = this.realname;
		this.irc.options.tls = this.tls;
		this.irc.options.rejectUnauthorized = this.rejectUnauthorized;
		this.irc.options.webirc = this.createWebIrc(client);
		this.irc.options.client_certificate = null;

		if (this.proxyEnabled) {
			this.irc.options.socks = {
				host: this.proxyHost,
				port: this.proxyPort,
				user: this.proxyUsername,
				pass: this.proxyPassword,
			};
		} else {
			delete this.irc.options.socks;
		}

		if (!this.sasl) {
			delete this.irc.options.sasl_mechanism;
			// irc-framework has a funny fallback where it uses nick + server pw
			// in the sasl handshake, if account is undefined, so we need an empty
			// object here to really turn it off
			this.irc.options.account = {};
		} else if (this.sasl === "external") {
			this.irc.options.sasl_mechanism = "EXTERNAL";
			this.irc.options.account = {};
			this.irc.options.client_certificate = ClientCertificate.get(this.uuid);
		} else if (this.sasl === "plain") {
			delete this.irc.options.sasl_mechanism;
			this.irc.options.account = {
				account: this.saslAccount,
				password: this.saslPassword,
			};
		}
	}

	private resolveBlowKeyFor(name: string): string | undefined {
		if (!name) {
			return this.fishGlobalKey || undefined;
		}

		const keyMap = this.fishKeys || {};
		const lower = name.toLowerCase();
		return keyMap[lower] || this.fishGlobalKey || undefined;
	}

	private resolveBlowModeFor(name: string): FishMode {
		if (!name) {
			return this.fishGlobalKeyMode || "ecb";
		}

		const modeMap = this.fishKeyModes || {};
		const lower = name.toLowerCase();
		return modeMap[lower] || this.fishGlobalKeyMode || "ecb";
	}

	private applyBlowKeysToChannels() {
		for (const c of this.channels) {
			if (c.type !== ChanType.CHANNEL && c.type !== ChanType.QUERY) {
				continue;
			}

			c.blowfishKey = this.resolveBlowKeyFor(c.name);
			c.blowfishMode = this.resolveBlowModeFor(c.name);
		}
	}

	resolveEncodingFor(name: string): string | undefined {
		if (!name) {
			return undefined;
		}

		const map = this.encodingMap || {};
		return map[name.toLowerCase()] || undefined;
	}

	createWebIrc(client: Client) {
		if (
			!Config.values.webirc ||
			!Object.prototype.hasOwnProperty.call(Config.values.webirc, this.host)
		) {
			return null;
		}

		const webircObject = {
			password: Config.values.webirc[this.host],
			username: "thelounge",
			address: client.config.browser?.ip,
			hostname: client.config.browser?.hostname,
			options: {},
		};

		// https://ircv3.net/specs/extensions/webirc#options
		if (client.config.browser?.isSecure) {
			webircObject.options = {
				secure: true,
			};
		}

		if (typeof Config.values.webirc[this.host] === "function") {
			webircObject.password = null;

			return (
				Config.values.webirc[this.host] as (
					obj: typeof webircObject,
					network: Network
				) => typeof webircObject
			)(webircObject, this);
		}

		return webircObject;
	}

	edit(this: NetworkWithIrcFramework, client: Client, args: NetworkFormData) {
		const oldNetworkName = this.name;
		const oldNick = this.nick;
		const oldRealname = this.realname;

		this.keepNick = null;
		this.nick = String(args.nick ?? "");
		this.host = String(args.host ?? "");
		this.name = String(args.name ?? "") || this.host;
		this.port = parseInt(String(args.port ?? 6667), 10);
		this.tls = !!args.tls;
		this.rejectUnauthorized = !!args.rejectUnauthorized;
		this.password = String(args.password ?? "");
		this.username = String(args.username ?? "");
		this.realname = String(args.realname ?? "");
		this.leaveMessage = String(args.leaveMessage ?? "");
		this.sasl = String(args.sasl ?? "");
		this.saslAccount = String(args.saslAccount ?? "");
		this.saslPassword = String(args.saslPassword ?? "");

		this.proxyHost = String(args.proxyHost ?? "");
		this.proxyPort = parseInt(String(args.proxyPort ?? 1080), 10);
		this.proxyUsername = String(args.proxyUsername ?? "");
		this.proxyPassword = String(args.proxyPassword ?? "");
		this.proxyEnabled = !!args.proxyEnabled;

		// Split commands into an array
		const commandsStr = Array.isArray(args.commands)
			? args.commands.join("\n")
			: String(args.commands ?? "");
		this.commands = commandsStr
			.replace(/\r\n|\r|\n/g, "\n")
			.split("\n")
			.filter((command) => command.length > 0);

		// FiSH: read global key and per-target keys (only update when provided)
		if (Object.prototype.hasOwnProperty.call(args, "fishGlobalKey")) {
			this.fishGlobalKey = Helper.toTrimmedString(args.fishGlobalKey || "");
		}

		// FiSH: read per-target keys (only update when provided)
		if (Object.prototype.hasOwnProperty.call(args, "fishKeys")) {
			const value = args.fishKeys as unknown;
			const map: Record<string, string> = {};

			if (value && typeof value === "object") {
				for (const [rawName, rawKey] of Object.entries(value as Record<string, unknown>)) {
					const name = Helper.toTrimmedString(rawName).toLowerCase();
					const key = Helper.toTrimmedString(rawKey);

					if (name && key) {
						map[name] = key;
					}
				}
			}

			this.fishKeys = map;
		}

		// FiSH: read global key mode (only update when provided)
		if (Object.prototype.hasOwnProperty.call(args, "fishGlobalKeyMode")) {
			const rawMode = args.fishGlobalKeyMode;
			this.fishGlobalKeyMode = rawMode === "cbc" ? "cbc" : "ecb";
		}

		// FiSH: read per-target key modes (only update when provided)
		if (Object.prototype.hasOwnProperty.call(args, "fishKeyModes")) {
			const value = args.fishKeyModes as unknown;
			const map: Record<string, FishMode> = {};

			if (value && typeof value === "object") {
				for (const [rawName, rawMode] of Object.entries(value as Record<string, unknown>)) {
					const name = Helper.toTrimmedString(rawName).toLowerCase();
					const mode = rawMode === "cbc" ? "cbc" : "ecb";

					if (name) {
						map[name] = mode;
					}
				}
			}

			this.fishKeyModes = map;
		}

		// FTP settings (only update when provided)
		if (Object.prototype.hasOwnProperty.call(args, "ftpEnabled")) {
			this.ftpEnabled = !!args.ftpEnabled;
		}

		if (Object.prototype.hasOwnProperty.call(args, "ftpHost")) {
			this.ftpHost = String(args.ftpHost ?? "");
		}

		if (Object.prototype.hasOwnProperty.call(args, "ftpPort")) {
			this.ftpPort = parseInt(String(args.ftpPort ?? 21), 10);
		}

		if (Object.prototype.hasOwnProperty.call(args, "ftpUsername")) {
			this.ftpUsername = String(args.ftpUsername ?? "");
		}

		if (Object.prototype.hasOwnProperty.call(args, "ftpPassword")) {
			this.ftpPassword = String(args.ftpPassword ?? "");
		}

		if (Object.prototype.hasOwnProperty.call(args, "ftpTls")) {
			this.ftpTls = !!args.ftpTls;
		}

		if (Object.prototype.hasOwnProperty.call(args, "ftpAutoInvite")) {
			this.ftpAutoInvite = !!args.ftpAutoInvite;
		}

		// Sync lobby channel name
		this.getLobby().name = this.name;

		if (this.name !== oldNetworkName) {
			// Send updated network name to all connected clients
			client.emit("network:name", {
				uuid: this.uuid,
				name: this.name,
			});
		}

		if (!this.validate(client)) {
			return;
		}

		// Apply FiSH keys to existing channels after edit
		if (Config.values.fish.enabled) {
			this.applyBlowKeysToChannels();
		}

		if (this.irc) {
			if (this.nick !== oldNick) {
				if (this.irc.connected) {
					// Send new nick straight away
					this.irc.changeNick(this.nick);
				} else {
					this.irc.user.nick = this.nick;

					// Update UI nick straight away if IRC is not connected
					client.emit("nick", {
						network: this.uuid,
						nick: this.nick,
					});
				}
			}

			if (
				this.irc.connected &&
				this.realname !== oldRealname &&
				this.irc.network.cap.isEnabled("setname")
			) {
				this.irc.raw("SETNAME", this.realname);
			}

			this.setIrcFrameworkOptions(client);

			if (this.irc.options?.username) {
				this.irc.user.username = this.irc.options.username;
			}

			if (this.irc.options?.gecos) {
				this.irc.user.gecos = this.irc.options.gecos;
			}
		}

		client.save();
	}

	destroy() {
		this.channels.forEach((channel) => channel.destroy());
	}

	setNick(this: Network, nick: string) {
		this.nick = nick;
		this.highlightRegex = new RegExp(
			// Do not match characters and numbers (unless IRC color)
			"(?:^|[^a-z0-9]|\x03[0-9]{1,2})" +
				// Escape nickname, as it may contain regex stuff
				_.escapeRegExp(nick) +
				// Do not match characters and numbers
				"(?:[^a-z0-9]|$)",

			// Case insensitive search
			"i"
		);

		if (this.keepNick === nick) {
			this.keepNick = null;
		}

		if (this.irc?.options) {
			this.irc.options.nick = nick;
		}
	}

	getFilteredClone(lastActiveChannel?: number, lastMessage?: number): SharedNetwork {
		return {
			uuid: this.uuid,
			name: this.name,
			nick: this.nick,
			serverOptions: this.serverOptions,
			status: this.getNetworkStatus(),
			channels: this.channels.map((channel) =>
				channel.getFilteredClone(lastActiveChannel, lastMessage)
			),
		};
	}

	getNetworkStatus() {
		const status = {
			connected: false,
			secure: false,
		};

		if (this.irc && this.irc.connection && this.irc.connection.transport) {
			const transport = this.irc.connection.transport;

			if (transport.socket) {
				const isLocalhost = ["127.0.0.1", "::1"].includes(transport.socket.remoteAddress);
				const isAuthorized = transport.socket.encrypted && transport.socket.authorized;

				status.connected = transport.isConnected();
				status.secure = isAuthorized || isLocalhost;
			}
		}

		return status;
	}

	addChannel(newChan: Chan) {
		// Assign FiSH key and mode based on network configuration when adding
		if (newChan && (newChan.type === ChanType.CHANNEL || newChan.type === ChanType.QUERY)) {
			newChan.blowfishKey = this.resolveBlowKeyFor(newChan.name);
			newChan.blowfishMode = this.resolveBlowModeFor(newChan.name);
		}

		let index = this.channels.length; // Default to putting as the last item in the array

		// Don't sort special channels in amongst channels/users.
		if (newChan.type === ChanType.CHANNEL || newChan.type === ChanType.QUERY) {
			// We start at 1 so we don't test against the lobby
			for (let i = 1; i < this.channels.length; i++) {
				const compareChan = this.channels[i];

				// Negative if the new chan is alphabetically before the next chan in the list, positive if after
				if (
					newChan.name.localeCompare(compareChan.name, undefined, {
						sensitivity: "base",
					}) <= 0 ||
					(compareChan.type !== ChanType.CHANNEL && compareChan.type !== ChanType.QUERY)
				) {
					index = i;
					break;
				}
			}
		}

		this.channels.splice(index, 0, newChan);
		return index;
	}

	quit(quitMessage?: string) {
		if (!this.irc) {
			return;
		}

		// https://ircv3.net/specs/extensions/sts#rescheduling-expiry-on-disconnect
		STSPolicies.refreshExpiration(this.host);

		this.irc.quit(quitMessage || this.leaveMessage || Config.values.leaveMessage);
	}

	exportForEdit() {
		const fieldsToReturn = [
			"uuid",
			"name",
			"nick",
			"password",
			"username",
			"realname",
			"leaveMessage",
			"sasl",
			"saslAccount",
			"saslPassword",
			"commands",

			"proxyEnabled",
			"proxyHost",
			"proxyPort",
			"proxyUsername",
			"proxyPassword",
		];

		if (!Config.values.lockNetwork) {
			fieldsToReturn.push("host");
			fieldsToReturn.push("port");
			fieldsToReturn.push("tls");
			fieldsToReturn.push("rejectUnauthorized");
		}

		const data = _.pick(this, fieldsToReturn) as {uuid: string} & Partial<Network> & {
				fishGlobalKey?: string;
				fishKeys?: Record<string, string>;
				fishGlobalKeyMode?: FishMode;
				fishKeyModes?: Record<string, FishMode>;
				hasSTSPolicy?: boolean;
			};

		data.hasSTSPolicy = !!STSPolicies.get(this.host);

		// Include FiSH fields for editing UI
		data.fishGlobalKey = this.fishGlobalKey || "";
		data.fishKeys = {...(this.fishKeys || {})};
		data.fishGlobalKeyMode = this.fishGlobalKeyMode || "ecb";
		data.fishKeyModes = {...(this.fishKeyModes || {})};

		// Include FTP fields for editing UI
		data.ftpEnabled = this.ftpEnabled || false;
		data.ftpHost = this.ftpHost || "";
		data.ftpPort = this.ftpPort || 21;
		data.ftpUsername = this.ftpUsername || "";
		data.ftpTls = this.ftpTls || false;
		data.ftpAutoInvite = this.ftpAutoInvite || false;
		data.ftpPassword = this.ftpPassword || "";

		// Include encoding map for editing UI
		data.encodingMap = {...(this.encodingMap || {})};

		return data;
	}

	export() {
		const network = _.pick(this, [
			"uuid",
			"awayMessage",
			"nick",
			"name",
			"host",
			"port",
			"tls",
			"userDisconnected",
			"rejectUnauthorized",
			"password",
			"username",
			"realname",
			"leaveMessage",
			"sasl",
			"saslAccount",
			"saslPassword",
			"commands",
			"ignoreList",

			"proxyHost",
			"proxyPort",
			"proxyUsername",
			"proxyEnabled",
			"proxyPassword",

			// FiSH persistence
			"fishGlobalKey",
			"fishKeys",
			"fishGlobalKeyMode",
			"fishKeyModes",

			// FTP Invite persistence
			"ftpEnabled",
			"ftpHost",
			"ftpPort",
			"ftpUsername",
			"ftpPassword",
			"ftpTls",
			"ftpAutoInvite",

			// Encoding persistence
			"encodingMap",
		]) as Network;

		// Encrypt credentials at rest when THE_LOUNGE_SECRET is configured
		if (network.password) network.password = encrypt(network.password);
		if (network.saslPassword) network.saslPassword = encrypt(network.saslPassword);
		if (network.ftpPassword) network.ftpPassword = encrypt(network.ftpPassword);

		network.channels = this.channels
			.filter(function (channel) {
				return channel.type === ChanType.CHANNEL || channel.type === ChanType.QUERY;
			})
			.map(function (chan) {
				const keys = ["name", "muted"];

				if (chan.type === ChanType.CHANNEL) {
					keys.push("key");
				} else if (chan.type === ChanType.QUERY) {
					keys.push("type");
					keys.push("pinned");
				}

				return _.pick(chan, keys);
				// Override the type because we're omitting ID
			}) as Channel[];

		return network;
	}

	getChannel(name: string) {
		name = name.toLowerCase();

		return _.find(this.channels, function (that, i) {
			// Skip network lobby (it's always unshifted into first position)
			return i > 0 && that.name.toLowerCase() === name;
		});
	}

	getLobby() {
		return this.channels[0];
	}
}

export default Network;
