import {expect} from "chai";
import {encrypt, decrypt, isEncrypted} from "../../server/utils/secretCrypto.js";

const SECRET = "test-secret-key-for-unit-tests";

describe("secretCrypto", function () {
	afterEach(function () {
		delete process.env.THE_LOUNGE_SECRET;
	});

	describe("isEncrypted", function () {
		it("should return true for enc:v1: prefixed strings", function () {
			expect(isEncrypted("enc:v1:somebase64data")).to.equal(true);
		});

		it("should return false for plaintext", function () {
			expect(isEncrypted("plaintext-password")).to.equal(false);
		});

		it("should return false for empty string", function () {
			expect(isEncrypted("")).to.equal(false);
		});
	});

	describe("encrypt", function () {
		it("should return plaintext unchanged when THE_LOUNGE_SECRET is not set", function () {
			const result = encrypt("mypassword");
			expect(result).to.equal("mypassword");
		});

		it("should return empty string unchanged regardless of secret", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			expect(encrypt("")).to.equal("");
		});

		it("should return an enc:v1: prefixed string when secret is set", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const result = encrypt("mypassword");
			expect(result).to.match(/^enc:v1:/);
		});

		it("should produce different ciphertext on each call (random IV/salt)", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const a = encrypt("mypassword");
			const b = encrypt("mypassword");
			expect(a).to.not.equal(b);
		});
	});

	describe("decrypt", function () {
		it("should return plaintext unchanged when not encrypted", function () {
			const result = decrypt("plaintext-password");
			expect(result).to.equal("plaintext-password");
		});

		it("should return empty string unchanged", function () {
			expect(decrypt("")).to.equal("");
		});

		it("should return empty string when secret is missing but value is encrypted", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const encrypted = encrypt("mypassword");
			delete process.env.THE_LOUNGE_SECRET;

			const result = decrypt(encrypted);
			expect(result).to.equal("");
		});

		it("should return empty string when decryption fails (wrong key)", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const encrypted = encrypt("mypassword");

			process.env.THE_LOUNGE_SECRET = "wrong-secret";
			const result = decrypt(encrypted);
			expect(result).to.equal("");
		});

		it("should return empty string for a corrupted enc:v1: value", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const result = decrypt("enc:v1:thisisnotvalidbase64====corrupted");
			expect(result).to.equal("");
		});
	});

	describe("encrypt / decrypt roundtrip", function () {
		it("should decrypt back to the original plaintext", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const plaintext = "my-secret-password";
			const encrypted = encrypt(plaintext);
			const decrypted = decrypt(encrypted);
			expect(decrypted).to.equal(plaintext);
		});

		it("should roundtrip with special characters", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const plaintext = "p@$$w0rd!#%^&*()_+-=[]{}|;':\",./<>?";
			expect(decrypt(encrypt(plaintext))).to.equal(plaintext);
		});

		it("should roundtrip with unicode characters", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const plaintext = "パスワード🔒";
			expect(decrypt(encrypt(plaintext))).to.equal(plaintext);
		});

		it("should roundtrip with a long password", function () {
			process.env.THE_LOUNGE_SECRET = SECRET;
			const plaintext = "a".repeat(300);
			expect(decrypt(encrypt(plaintext))).to.equal(plaintext);
		});
	});
});
