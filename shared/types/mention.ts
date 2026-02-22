import {MessageType, UserInMessage} from "./msg.js";

export type SharedMention = {
	chanId: number;
	msgId: number;
	type: MessageType;
	time: Date;
	text: string;
	from: UserInMessage;
};
