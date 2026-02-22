import {SharedMsg} from "./msg.js";

export type SearchQuery = {
	searchTerm: string;
	networkUuid: string;
	channelName: string;
	offset: number;
};

export type SearchResponse = SearchQuery & {
	results: SharedMsg[];
};
