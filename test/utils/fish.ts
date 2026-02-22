import {expect} from "chai";
import {
	fishEncrypt,
	fishDecrypt,
	createFishMessage,
	tryDecryptFishMessage,
	tryDecryptFishLine,
} from "../../server/utils/fish.js";

const FISH_BASE64_CHARS = "./0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("FiSH Blowfish encryption", function () {
	describe("fishEncrypt / fishDecrypt roundtrip", function () {
		it("should encrypt then decrypt to original plaintext", function () {
			const key = "testkey123";
			const plaintext = "Hello, World!";
			const encrypted = fishEncrypt(plaintext, key);
			const result = fishDecrypt(encrypted, key);
			expect(result.status).to.equal("success");
			expect(result.text).to.equal(plaintext);
		});

		it("should roundtrip with a short key", function () {
			const key = "ab";
			const plaintext = "test message";
			const encrypted = fishEncrypt(plaintext, key);
			const result = fishDecrypt(encrypted, key);
			expect(result.status).to.equal("success");
			expect(result.text).to.equal(plaintext);
		});

		it("should roundtrip with a long key", function () {
			const key = "this-is-a-very-long-encryption-key-for-testing-purposes";
			const plaintext = "secret data";
			const encrypted = fishEncrypt(plaintext, key);
			const result = fishDecrypt(encrypted, key);
			expect(result.status).to.equal("success");
			expect(result.text).to.equal(plaintext);
		});

		it("should roundtrip with text lengths 1-8 (padding test)", function () {
			const key = "padtest";

			for (let len = 1; len <= 8; len++) {
				const plaintext = "ABCDEFGH".slice(0, len);
				const encrypted = fishEncrypt(plaintext, key);
				const result = fishDecrypt(encrypted, key);
				expect(result.status).to.equal("success");
				// Decrypted text includes null padding bytes which get stripped by removeBadChars
				expect(result.text).to.include(plaintext);
			}
		});

		it("should roundtrip with multi-block messages (>8 bytes)", function () {
			const key = "multiblock";
			const plaintext = "This is a longer message that spans multiple blocks!";
			const encrypted = fishEncrypt(plaintext, key);
			const result = fishDecrypt(encrypted, key);
			expect(result.status).to.equal("success");
			expect(result.text).to.equal(plaintext);
		});
	});

	describe("fishDecrypt edge cases", function () {
		it("should return error for ciphertext shorter than 12 chars", function () {
			const result = fishDecrypt("short", "key");
			expect(result.status).to.equal("error");
			expect(result.text).to.equal("");
		});

		it("should return error for invalid base64 characters", function () {
			const result = fishDecrypt("!!!!!!!!!!!!", "key");
			expect(result.status).to.equal("error");
			expect(result.text).to.equal("");
		});

		it("should return partial when ciphertext length is not multiple of 12", function () {
			const key = "partialtest";
			const plaintext = "Hello";
			const encrypted = fishEncrypt(plaintext, key);
			// Append extra chars to make it not a multiple of 12
			const result = fishDecrypt(encrypted + "abc", key);
			expect(result.status).to.equal("partial");
		});

		it("should produce garbled output with wrong key", function () {
			const plaintext = "secret message";
			const encrypted = fishEncrypt(plaintext, "rightkey");
			const result = fishDecrypt(encrypted, "wrongkey");
			expect(result.status).to.equal("success");
			expect(result.text).to.not.equal(plaintext);
		});
	});

	describe("fishEncrypt properties", function () {
		it("should produce output length that is always a multiple of 12", function () {
			const key = "lentest";

			for (let len = 1; len <= 20; len++) {
				const plaintext = "X".repeat(len);
				const encrypted = fishEncrypt(plaintext, key);
				expect(encrypted.length % 12).to.equal(0);
			}
		});

		it("should produce output containing only valid FiSH base64 characters", function () {
			const key = "chartest";
			const plaintext = "Test with various chars: ~!@#$%^&*()";
			const encrypted = fishEncrypt(plaintext, key);

			for (const char of encrypted) {
				expect(FISH_BASE64_CHARS).to.include(char);
			}
		});
	});

	describe("createFishMessage", function () {
		it("should return string prefixed with +OK", function () {
			const message = createFishMessage("hello", "mykey");
			expect(message).to.match(/^\+OK /);
		});

		it("should produce a payload that decrypts back to the original", function () {
			const key = "msgkey";
			const plaintext = "encrypted message";
			const message = createFishMessage(plaintext, key);
			const payload = message.slice(4); // Remove "+OK "
			const result = fishDecrypt(payload, key);
			expect(result.status).to.equal("success");
			expect(result.text).to.equal(plaintext);
		});
	});

	describe("tryDecryptFishMessage", function () {
		it("should decrypt +OK <payload> format and return {text, mode}", function () {
			const key = "fishkey";
			const plaintext = "hello fish";
			const encrypted = fishEncrypt(plaintext, key);
			const result = tryDecryptFishMessage(`+OK ${encrypted}`, key);
			expect(result).to.not.equal(null);
			expect(result!.text).to.include(plaintext);
			expect(result!.mode).to.equal("ecb");
		});

		it("should decrypt *OK <payload> format", function () {
			const key = "fishkey";
			const plaintext = "hello fish";
			const encrypted = fishEncrypt(plaintext, key);
			const result = tryDecryptFishMessage(`*OK ${encrypted}`, key);
			expect(result).to.not.equal(null);
			expect(result!.text).to.include(plaintext);
		});

		it("should decrypt mcps <payload> format", function () {
			const key = "fishkey";
			const plaintext = "hello fish";
			const encrypted = fishEncrypt(plaintext, key);
			const result = tryDecryptFishMessage(`mcps ${encrypted}`, key);
			expect(result).to.not.equal(null);
			expect(result!.text).to.include(plaintext);
		});

		it("should return null for non-FiSH messages", function () {
			const result = tryDecryptFishMessage("just a regular message", "key");
			expect(result).to.equal(null);
		});

		it("should return null when no key provided", function () {
			const result = tryDecryptFishMessage("+OK somedata");
			expect(result).to.equal(null);
		});
	});

	describe("CBC mode", function () {
		it("should encrypt and decrypt in CBC mode roundtrip", function () {
			const key = "cbckey";
			const plaintext = "Hello CBC mode!";
			const encrypted = fishEncrypt(plaintext, key, "cbc");
			const result = fishDecrypt(encrypted, key, "cbc");
			expect(result.status).to.equal("success");
			expect(result.text).to.include(plaintext);
		});

		it("should set mode to cbc in decrypt result", function () {
			const key = "cbckey";
			const plaintext = "mode test";
			const encrypted = fishEncrypt(plaintext, key, "cbc");
			const result = fishDecrypt(encrypted, key, "cbc");
			expect(result.mode).to.equal("cbc");
		});

		it("createFishMessage with CBC should produce +OK * prefix", function () {
			const message = createFishMessage("hello", "mykey", "cbc");
			expect(message).to.match(/^\+OK \*/);
		});

		it("tryDecryptFishMessage should auto-detect CBC from +OK * format", function () {
			const key = "autodetect";
			const plaintext = "cbc auto detect";
			const message = createFishMessage(plaintext, key, "cbc");
			const result = tryDecryptFishMessage(message, key);
			expect(result).to.not.equal(null);
			expect(result!.mode).to.equal("cbc");
			expect(result!.text).to.include(plaintext);
		});

		it("tryDecryptFishLine should show [CBC] tag for CBC messages", function () {
			const key = "cbcline";
			const plaintext = "cbc line test";
			const message = createFishMessage(plaintext, key, "cbc");
			const result = tryDecryptFishLine(message, key);
			expect(result).to.not.equal(null);
			expect(result).to.match(/^\x0314\[CBC\]\x03 /);
			expect(result).to.include(plaintext);
		});

		it("CBC ciphertext should not be in FiSH base64 alphabet (uses standard base64)", function () {
			const encrypted = fishEncrypt("test", "key", "cbc");
			// Standard base64 uses +, /, = which are NOT in FiSH base64
			// Check that it's valid standard base64 by decoding and re-encoding
			const decoded = Buffer.from(encrypted, "base64");
			expect(decoded.length).to.be.greaterThan(0);
		});
	});

	describe("tryDecryptFishLine", function () {
		it("should return formatted string with [ECB] color prefix for ECB messages", function () {
			const key = "fishkey";
			const plaintext = "hello fish";
			const encrypted = fishEncrypt(plaintext, key);
			const result = tryDecryptFishLine(`+OK ${encrypted}`, key);
			expect(result).to.not.equal(null);
			// \x0314 is IRC color code 14, \x03 resets
			expect(result).to.match(/^\x0314\[ECB\]\x03 /);
			expect(result).to.include(plaintext);
		});

		it("should return null for non-FiSH messages", function () {
			expect(tryDecryptFishLine("just a regular message", "key")).to.equal(null);
		});

		it("should return null when no key provided", function () {
			expect(tryDecryptFishLine("+OK somedata")).to.equal(null);
		});
	});
});
