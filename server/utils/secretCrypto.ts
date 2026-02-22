import crypto from "node:crypto";
import log from "../log.js";

const PREFIX = "enc:v1:";
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function getSecret(): string | null {
	return process.env.THE_LOUNGE_SECRET || null;
}

export function isEncrypted(value: string): boolean {
	return value.startsWith(PREFIX);
}

export function encrypt(plaintext: string): string {
	const secret = getSecret();

	if (!secret || !plaintext) {
		return plaintext;
	}

	const salt = crypto.randomBytes(SALT_LEN);
	const iv = crypto.randomBytes(IV_LEN);
	const key = crypto.scryptSync(secret, salt, 32);
	const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
	const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	const data = Buffer.concat([salt, iv, tag, enc]);
	return PREFIX + data.toString("base64");
}

export function decrypt(stored: string): string {
	if (!isEncrypted(stored)) {
		return stored;
	}

	const secret = getSecret();

	if (!secret) {
		log.warn(
			"Found an encrypted credential but THE_LOUNGE_SECRET is not set. The credential will be treated as empty."
		);
		return "";
	}

	try {
		const data = Buffer.from(stored.slice(PREFIX.length), "base64");
		const salt = data.subarray(0, SALT_LEN);
		const iv = data.subarray(SALT_LEN, SALT_LEN + IV_LEN);
		const tag = data.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
		const enc = data.subarray(SALT_LEN + IV_LEN + TAG_LEN);
		const key = crypto.scryptSync(secret, salt, 32);
		const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(tag);
		return decipher.update(enc).toString() + decipher.final("utf8").toString();
	} catch {
		log.warn("Failed to decrypt a credential. The credential will be treated as empty.");
		return "";
	}
}
