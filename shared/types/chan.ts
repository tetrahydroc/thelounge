import {SharedMsg} from "./msg";

// User groups sent by seedpool/enhanced capable servers
export type UserGroup = {
	name: string;
	position: number;
	users: string[];
};


export type DefaultTorrentSiteInfo = {
	profileUrl: string;
}

export type TorrentSite = {
	disabled?: boolean;
	abbreviation: string;
	name: string;
	host: string;
	domain: string;
	channels?: string[];
	profileUrl?: string;
}

export type TorrentSiteInfo = TorrentSite & DefaultTorrentSiteInfo;

export enum ChanType {
	CHANNEL = "channel",
	LOBBY = "lobby",
	QUERY = "query",
	SPECIAL = "special",
}

export enum SpecialChanType {
	BANLIST = "list_bans",
	INVITELIST = "list_invites",
	CHANNELLIST = "list_channels",
	IGNORELIST = "list_ignored",
}

export enum ChanState {
	PARTED = 0,
	JOINED = 1,
}

export type SharedChan = {
	// TODO: don't force existence, figure out how to make TS infer it.
	id: number;
	messages: SharedMsg[];
	name: string;
	key: string;
	topic: string;
	firstUnread: number;
	unread: number;
	highlight: number;
	muted: boolean;
	type: ChanType;
	state: ChanState;
	pinned: boolean;

	special?: SpecialChanType;
	data?: unknown;
	closed?: boolean;
	num_users?: number;
	groups?: UserGroup[];
	torrentSite?: TorrentSiteInfo;
};
