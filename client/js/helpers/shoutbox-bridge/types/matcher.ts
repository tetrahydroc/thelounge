import {type SharedMsg} from "../../../../../shared/types/msg";
import {type MessageEdit} from "./parser";

interface BaseMatcher {
	type: "basic" | "advanced";
	name: string;
	description: string;
	transform: (message: SharedMsg) => MessageEdit | undefined;
}

interface BasicMatcher extends BaseMatcher {
	type: "basic";
	matches: string[];
	regex: RegExp;
}

interface AdvancedMatcher extends BaseMatcher {
	type: "advanced";
	matches: (nick: string) => boolean;
}

export type Matcher = BasicMatcher | AdvancedMatcher;
