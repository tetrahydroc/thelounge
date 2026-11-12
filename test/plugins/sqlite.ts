import fs from "fs";
import path from "path";
import {expect} from "chai";
import util from "../util.ts";
import Msg from "../../dist/server/models/msg.js";
import {MessageType} from "../../dist/shared/types/msg.js";
import Config from "../../dist/server/config.js";
import MessageStorage, {
	currentSchemaVersion,
	migrations,
	necessaryMigrations,
	rollbacks,
	computeSidecarSyncPlan,
} from "../../dist/server/plugins/messageStorage/sqlite.js";
import Database from "better-sqlite3";
import type {DeletionRequest} from "../../server/plugins/messageStorage/types.js";
import type Network from "../../server/models/network.js";
import type {Channel} from "../../server/models/chan.js";

// Test-specific types for SQLite message storage tests
type SqlValue = string | number | boolean | null | Buffer;
type TestNetwork = Pick<Network, "uuid">;
type TestChannel = Pick<Channel, "name">;

const orig_schema = [
	// Schema version #1
	// DO NOT CHANGE THIS IN ANY WAY, it's needed to properly test migrations
	"CREATE TABLE IF NOT EXISTS options (name TEXT, value TEXT, CONSTRAINT name_unique UNIQUE (name))",
	"CREATE TABLE IF NOT EXISTS messages (network TEXT, channel TEXT, time INTEGER, type TEXT, msg TEXT)",
	"CREATE INDEX IF NOT EXISTS network_channel ON messages (network, channel)",
	"CREATE INDEX IF NOT EXISTS time ON messages (time)",
];

const v1_schema_version = 1520239200;

const v1_dummy_messages = [
	{
		network: "8f650427-79a2-4950-b8af-94088b61b37c",
		channel: "##linux",
		time: 1594845354280,
		type: "message",
		msg: '{"from":{"mode":"","nick":"rascul"},"text":"db on a flash drive doesn\'t sound very nice though","self":false,"highlight":false,"users":[]}',
	},
	{
		network: "8f650427-79a2-4950-b8af-94088b61b37c",
		channel: "##linux",
		time: 1594845357234,
		type: "message",
		msg: '{"from":{"mode":"","nick":"GrandPa-G"},"text":"that\'s the point of changing to make sure.","self":false,"highlight":false,"users":[]}',
	},
	{
		network: "8f650427-79a2-4950-b8af-94088b61b37c",
		channel: "#pleroma-dev",
		time: 1594845358464,
		type: "message",
		msg: '{"from":{"mode":"@","nick":"rinpatch"},"text":"it\'s complicated","self":false,"highlight":false,"users":[]}',
	},
];

describe("SQLite migrations", function () {
	let db: Database.Database;

	function serialize_run(stmt: string, ...params: SqlValue[]): Promise<void> {
		try {
			db.prepare(stmt).run(...params);
			return Promise.resolve();
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}

	before(async function () {
		db = new Database(":memory:");

		for (const stmt of orig_schema) {
			await serialize_run(stmt);
		}

		for (const msg of v1_dummy_messages) {
			await serialize_run(
				"INSERT INTO messages(network, channel, time, type, msg) VALUES(?, ?, ?, ?, ?)",
				msg.network,
				msg.channel,
				msg.time,
				msg.type,
				msg.msg
			);
		}
	});

	after(function () {
		db.close();
	});

	it("has a down migration for every migration", function () {
		expect(migrations.length).to.eq(rollbacks.length);
		expect(migrations.map((m) => m.version)).to.have.ordered.members(
			rollbacks.map((r) => r.version)
		);
	});

	it("has working up-migrations", async function () {
		const to_execute = necessaryMigrations(v1_schema_version);
		expect(to_execute.length).to.eq(migrations.length);
		await serialize_run("BEGIN EXCLUSIVE TRANSACTION");

		for (const stmt of to_execute.map((m) => m.stmts).flat()) {
			await serialize_run(stmt);
		}

		await serialize_run("COMMIT TRANSACTION");
	});

	it("has working down-migrations", async function () {
		await serialize_run("BEGIN EXCLUSIVE TRANSACTION");

		for (const rollback of rollbacks.slice().reverse()) {
			if (rollback.rollback_forbidden) {
				throw Error(
					"Try to write a down migration, if you really can't, flip this to a break"
				);
			}

			for (const stmt of rollback.stmts) {
				await serialize_run(stmt);
			}
		}

		await serialize_run("COMMIT TRANSACTION");
	});
});

describe("SQLite unit tests", function () {
	let store: MessageStorage;

	beforeEach(async function () {
		store = new MessageStorage("testUser");
		await store._enable(":memory:");
		store.initDone.resolve();
	});

	afterEach(async function () {
		await store.close();
	});

	it("deletes messages when asked to", async function () {
		const baseDate = new Date();

		const net: TestNetwork = {uuid: "testnet"};
		const chan: TestChannel = {name: "#channel"};

		for (let i = 0; i < 14; ++i) {
			await store.index(
				net,
				chan,
				new Msg({
					time: dateAddDays(baseDate, -i),
					text: `msg ${i}`,
				})
			);
		}

		const limit = 1;
		const delReq: DeletionRequest = {
			messageTypes: [MessageType.MESSAGE],
			limit: limit,
			olderThanDays: 2,
		};

		let deleted = await store.deleteMessages(delReq);
		expect(deleted).to.equal(limit, "number of deleted messages doesn't match");

		let id = 0;
		let messages = await store.getMessages(net, chan, () => id++);
		expect(messages.find((m) => m.text === "msg 13")).to.equal(undefined); // oldest gets deleted first

		// let's test if it properly cleans now
		delReq.limit = 100;
		deleted = await store.deleteMessages(delReq);
		expect(deleted).to.equal(11, "number of deleted messages doesn't match");
		messages = await store.getMessages(net, chan, () => id++);
		expect(messages.map((m) => m.text)).to.have.ordered.members(["msg 1", "msg 0"]);
	});

	it("deletes only the types it should", async function () {
		const baseDate = new Date();

		const net: TestNetwork = {uuid: "testnet"};
		const chan: TestChannel = {name: "#channel"};

		for (let i = 0; i < 6; ++i) {
			await store.index(
				net,
				chan,
				new Msg({
					time: dateAddDays(baseDate, -i),
					text: `msg ${i}`,
					type: [
						MessageType.ACTION,
						MessageType.AWAY,
						MessageType.JOIN,
						MessageType.PART,
						MessageType.KICK,
						MessageType.MESSAGE,
					][i],
				})
			);
		}

		const delReq: DeletionRequest = {
			messageTypes: [MessageType.ACTION, MessageType.JOIN, MessageType.KICK],
			limit: 100, // effectively no limit
			olderThanDays: 0,
		};

		let deleted = await store.deleteMessages(delReq);
		expect(deleted).to.equal(3, "number of deleted messages doesn't match");

		let id = 0;
		let messages = await store.getMessages(net, chan, () => id++);
		expect(messages.map((m) => m.type)).to.have.ordered.members([
			MessageType.MESSAGE,
			MessageType.PART,
			MessageType.AWAY,
		]);

		delReq.messageTypes = [
			MessageType.JOIN, // this is not in the remaining set, just here as a dummy
			MessageType.PART,
			MessageType.MESSAGE,
		];
		deleted = await store.deleteMessages(delReq);
		expect(deleted).to.equal(2, "number of deleted messages doesn't match");
		messages = await store.getMessages(net, chan, () => id++);
		expect(messages.map((m) => m.type)).to.have.ordered.members([MessageType.AWAY]);
	});
});

describe("SQLite Message Storage", function () {
	// Increase timeout due to unpredictable I/O on CI services
	this.timeout(util.isRunningOnCI() ? 25000 : 5000);
	this.slow(300);

	const expectedPath = path.join(Config.getHomePath(), "logs", "testUser.sqlite3");
	let store: MessageStorage;

	function db_get_one(stmt: string, ...params: SqlValue[]): Promise<Record<string, SqlValue>> {
		try {
			const row = store.database.prepare(stmt).get(...params);
			return Promise.resolve(row);
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}

	const expectedSidecarPath = path.join(Config.getHomePath(), "logs", "testUser.fts.sqlite3");

	before(function (done) {
		store = new MessageStorage("testUser");

		// Delete database file (and fts sidecar) from previous test run
		if (fs.existsSync(expectedSidecarPath)) {
			fs.unlinkSync(expectedSidecarPath);
		}

		if (fs.existsSync(expectedPath)) {
			fs.unlink(expectedPath, done);
		} else {
			done();
		}
	});

	after(function (done) {
		// After tests run, remove the logs folder
		// so we return to the clean state
		fs.unlinkSync(expectedPath);

		if (fs.existsSync(expectedSidecarPath)) {
			fs.unlinkSync(expectedSidecarPath);
		}

		fs.rmdir(path.join(Config.getHomePath(), "logs"), done);
	});

	it("should create database file", async function () {
		expect(store.isEnabled).to.equal(false);
		expect(fs.existsSync(expectedPath)).to.equal(false);

		await store.enable();
		expect(store.isEnabled).to.equal(true);
	});

	it("should create the fts sidecar file", function () {
		expect(fs.existsSync(expectedSidecarPath)).to.equal(true);
	});

	it("main file stays tetra-openable (no fork-only objects, pinned version)", async function () {
		const optRow = await db_get_one("SELECT value FROM options WHERE name = 'schema_version'");
		expect(optRow.value).to.equal("1703322560448");

		const ftsTable = await db_get_one(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'"
		);
		expect(ftsTable).to.equal(undefined);

		const triggers = store.database
			.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
			.all();
		expect(triggers).to.have.lengthOf(0);

		const columns = store.database
			.prepare("PRAGMA table_info(messages)")
			.all()
			.map((c) => (c as Record<string, unknown>).name);
		expect(columns).to.deep.equal(["id", "network", "channel", "time", "type", "msg"]);
	});

	it("should resolve an empty array when disabled", async function () {
		store.isEnabled = false;
		// When disabled, getMessages returns empty array without using params
		const dummyNet: TestNetwork = {uuid: "disabled-test"};
		const dummyChan: TestChannel = {name: "#disabled-test"};
		const messages = await store.getMessages(dummyNet, dummyChan, () => 0);
		expect(messages).to.have.lengthOf(0);
		store.isEnabled = true;
	});

	it("should insert schema version to options table", async function () {
		const row = await db_get_one("SELECT value FROM options WHERE name = 'schema_version'");
		expect(row.value).to.equal(currentSchemaVersion.toString());
	});

	it("should insert migrations", async function () {
		const row = await db_get_one(
			"SELECT id, version FROM migrations WHERE version = ?",
			currentSchemaVersion
		);
		expect(row).to.not.equal(undefined);
	});

	it("should store a message", async function () {
		await store.index(
			{uuid: "this-is-a-network-guid"} as Network,
			{name: "#thisISaCHANNEL"} as Channel,
			new Msg({
				time: 123456789,
				text: "Hello from sqlite world!",
			})
		);
	});

	it("should retrieve previously stored message", async function () {
		let msgid = 0;
		const messages = await store.getMessages(
			{
				uuid: "this-is-a-network-guid",
			} as Network,
			{
				name: "#thisisaCHANNEL",
			} as Channel,
			() => msgid++
		);
		expect(messages).to.have.lengthOf(1);
		const msg = messages[0];
		expect(msg.text).to.equal("Hello from sqlite world!");
		expect(msg.type).to.equal(MessageType.MESSAGE);
		expect(msg.time.getTime()).to.equal(123456789);
	});

	it("should retrieve latest LIMIT messages in order", async function () {
		const originalMaxHistory = Config.values.maxHistory;

		try {
			Config.values.maxHistory = 2;

			for (let i = 0; i < 200; ++i) {
				await store.index(
					{uuid: "retrieval-order-test-network"} as Network,
					{name: "#channel"} as Channel,
					new Msg({
						time: 123456789 + i,
						text: `msg ${i}`,
					})
				);
			}

			let msgId = 0;
			const messages = await store.getMessages(
				{uuid: "retrieval-order-test-network"} as Network,
				{name: "#channel"} as Channel,
				() => msgId++
			);
			expect(messages).to.have.lengthOf(2);
			expect(messages.map((i_1) => i_1.text)).to.deep.equal(["msg 198", "msg 199"]);
		} finally {
			Config.values.maxHistory = originalMaxHistory;
		}
	});

	it("should search messages", async function () {
		const originalMaxHistory = Config.values.maxHistory;

		try {
			Config.values.maxHistory = 2;

			const search = await store.search({
				searchTerm: "msg",
				networkUuid: "retrieval-order-test-network",
				channelName: "",
				offset: 0,
			});
			expect(search.results).to.have.lengthOf(100);
			const expectedMessages: string[] = [];

			for (let i = 100; i < 200; ++i) {
				expectedMessages.push(`msg ${i}`);
			}

			expect(search.results.map((i_1) => i_1.text)).to.deep.equal(expectedMessages);
		} finally {
			Config.values.maxHistory = originalMaxHistory;
		}
	});

	it("should search messages with escaped wildcards", async function () {
		async function assertResults(query: string, expected: string[]) {
			const search = await store.search({
				searchTerm: query,
				networkUuid: "this-is-a-network-guid2",
				channelName: "",
				offset: 0,
			});
			expect(search.results.map((i) => i.text)).to.deep.equal(expected);
		}

		const originalMaxHistory = Config.values.maxHistory;

		try {
			Config.values.maxHistory = 3;

			await store.index(
				{uuid: "this-is-a-network-guid2"} as Network,
				{name: "#channel"} as Channel,
				new Msg({
					time: 123456790,
					text: `foo % bar _ baz`,
				})
			);

			await store.index(
				{uuid: "this-is-a-network-guid2"} as Network,
				{name: "#channel"} as Channel,
				new Msg({
					time: 123456791,
					text: `foo bar x baz`,
				})
			);

			await store.index(
				{uuid: "this-is-a-network-guid2"} as Network,
				{name: "#channel"} as Channel,
				new Msg({
					time: 123456792,
					text: `bar @ baz`,
				})
			);

			await assertResults("foo", ["foo % bar _ baz", "foo bar x baz"]);
			await assertResults("%", ["foo % bar _ baz"]);
			await assertResults("foo % bar ", ["foo % bar _ baz"]);
			await assertResults("_", ["foo % bar _ baz"]);
			await assertResults("bar _ baz", ["foo % bar _ baz"]);
			await assertResults("%%", []);
			await assertResults("@%", []);
			await assertResults("@", ["bar @ baz"]);
		} finally {
			Config.values.maxHistory = originalMaxHistory;
		}
	});

	it("should be able to downgrade", async function () {
		for (const rollback of rollbacks.slice().reverse()) {
			if (rollback.rollback_forbidden) {
				throw Error(
					"Try to write a down migration, if you really can't, flip this to a break"
				);
			}

			const new_version = await store.downgrade_to(rollback.version);
			expect(new_version).to.equal(rollback.version);
		}
	});

	it("should close database", async function () {
		await store.close();
		expect(fs.existsSync(expectedPath)).to.equal(true);
	});
});

describe("computeSidecarSyncPlan", function () {
	it("plans a rebuild when the indexed prefix doesn't match", function () {
		const plan = computeSidecarSyncPlan({
			mainCount: 10,
			ftsCount: 8,
			ftsMaxRowid: 10,
			prefixCount: 9, // a row within [1, 10] was deleted from messages
		});
		expect(plan.action).to.equal("rebuild");
	});

	it("plans a cheap append when the drift is a pure tail", function () {
		const plan = computeSidecarSyncPlan({
			mainCount: 20,
			ftsCount: 10,
			ftsMaxRowid: 10,
			prefixCount: 10, // everything up to ftsMaxRowid is still accounted for
		});
		expect(plan.action).to.equal("append");
		expect(plan.fromId).to.equal(10);
	});

	it("plans a no-op-shaped append for a brand-new empty sidecar", function () {
		const plan = computeSidecarSyncPlan({
			mainCount: 5,
			ftsCount: 0,
			ftsMaxRowid: 0,
			prefixCount: 0,
		});
		expect(plan.action).to.equal("append");
		expect(plan.fromId).to.equal(0);
	});

	it("plans a no-op-shaped append when already fully in sync", function () {
		const plan = computeSidecarSyncPlan({
			mainCount: 5,
			ftsCount: 5,
			ftsMaxRowid: 5,
			prefixCount: 5,
		});
		expect(plan.action).to.equal("append");
		expect(plan.fromId).to.equal(5);
	});
});

// computeSidecarSyncPlan above only tests the pure decision logic - these
// exercise the actual I/O path (reconcileSidecar / catchUpSidecarAppend /
// fullRebuildSidecar) against real files, simulating the scenarios the
// planner is meant to handle: the sidecar going missing entirely, and tetra
// (or anything else) mutating the main file while the sidecar isn't looking.
describe("SQLite sidecar reconcile (real I/O)", function () {
	const userName = "sidecarReconcileTestUser";
	const mainPath = path.join(Config.getHomePath(), "logs", `${userName}.sqlite3`);
	const sidecarPath = path.join(Config.getHomePath(), "logs", `${userName}.fts.sqlite3`);

	afterEach(function () {
		for (const p of [mainPath, sidecarPath]) {
			if (fs.existsSync(p)) {
				fs.unlinkSync(p);
			}
		}
	});

	async function indexMessages(
		store: MessageStorage,
		net: TestNetwork,
		chan: TestChannel,
		texts: string[]
	) {
		for (const text of texts) {
			await store.index(net, chan, new Msg({text}));
		}
	}

	it("rebuilds search from scratch when the sidecar file is deleted", async function () {
		const net: TestNetwork = {uuid: "recon-net"};
		const chan: TestChannel = {name: "#recon"};

		let store = new MessageStorage(userName);
		await store.enable();
		await indexMessages(store, net, chan, ["alpha one", "alpha two", "alpha three"]);
		await store.close();

		expect(fs.existsSync(sidecarPath)).to.equal(true);
		fs.unlinkSync(sidecarPath);
		expect(fs.existsSync(sidecarPath)).to.equal(false);

		store = new MessageStorage(userName);
		await store.enable();

		const results = await store.search({
			searchTerm: "alpha",
			networkUuid: net.uuid,
			channelName: "",
			offset: 0,
		});
		expect(results.results).to.have.lengthOf(3);

		await store.close();
	});

	it("catches up when new messages were added directly to the main file (pure append)", async function () {
		const net: TestNetwork = {uuid: "recon-net-2"};
		const chan: TestChannel = {name: "#recon2"};

		let store = new MessageStorage(userName);
		await store.enable();
		await indexMessages(store, net, chan, ["bravo one", "bravo two"]);
		await store.close();

		// Simulate tetra (or anything else without sidecar knowledge) writing
		// straight to the main file - no FTS involvement at all.
		const rawDb = new Database(mainPath);
		rawDb
			.prepare(
				"INSERT INTO messages(network, channel, time, type, msg) VALUES (?, ?, ?, ?, ?)"
			)
			.run(net.uuid, chan.name, Date.now(), "message", JSON.stringify({text: "bravo three"}));
		rawDb.close();

		store = new MessageStorage(userName);
		await store.enable(); // should take the cheap append path, not a full rebuild

		const results = await store.search({
			searchTerm: "bravo",
			networkUuid: net.uuid,
			channelName: "",
			offset: 0,
		});
		expect(results.results.map((m) => m.text)).to.have.members([
			"bravo one",
			"bravo two",
			"bravo three",
		]);

		await store.close();
	});

	it("rebuilds when a message was deleted from within the already-indexed range", async function () {
		const net: TestNetwork = {uuid: "recon-net-3"};
		const chan: TestChannel = {name: "#recon3"};

		let store = new MessageStorage(userName);
		await store.enable();
		await indexMessages(store, net, chan, ["charlie one", "charlie two", "charlie three"]);
		await store.close();

		// Simulate tetra deleting a message directly from the main file
		// (not through this fork's deleteChannel/deleteMessages, which would
		// keep the sidecar in sync themselves) - a real inconsistency within
		// the range the sidecar already believed was fully indexed.
		const rawDb = new Database(mainPath);
		rawDb.prepare("DELETE FROM messages WHERE msg LIKE '%charlie two%'").run();
		const remainingCount = (
			rawDb.prepare("SELECT COUNT(*) as c FROM messages").get() as {c: number}
		).c;
		rawDb.close();
		expect(remainingCount).to.equal(2);

		store = new MessageStorage(userName);
		await store.enable(); // should detect the prefix mismatch and fully rebuild

		const results = await store.search({
			searchTerm: "charlie",
			networkUuid: net.uuid,
			channelName: "",
			offset: 0,
		});
		expect(results.results.map((m) => m.text)).to.have.members([
			"charlie one",
			"charlie three",
		]);

		await store.close();
	});
});

describe("SQLite legacy fork repair", function () {
	// Shape of the main file this fork wrote before the sidecar refactor -
	// schema_version 1788000000000, FTS5 table + triggers living directly in
	// the main file. DO NOT change this to match the current schema; the
	// whole point of this fixture is to be the *old* shape.
	const legacyMainSchema = [
		"CREATE TABLE options (name TEXT, value TEXT, CONSTRAINT name_unique UNIQUE (name))",
		"CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, network TEXT, channel TEXT, time INTEGER, type TEXT, msg TEXT)",
		`CREATE TABLE migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL UNIQUE,
            rollback_forbidden INTEGER DEFAULT 0 NOT NULL
        )`,
		`CREATE TABLE rollback_steps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            migration_id INTEGER NOT NULL REFERENCES migrations ON DELETE CASCADE,
            step INTEGER NOT NULL,
            statement TEXT NOT NULL
        )`,
		"CREATE INDEX network_channel ON messages (network, channel)",
		"CREATE INDEX time ON messages (time)",
		"CREATE INDEX msg_type_idx on messages (type)",
		"CREATE INDEX network_channel_time ON messages (network, channel, time)",
		"CREATE VIRTUAL TABLE messages_fts USING fts5(text, tokenize='trigram', detail=none)",
		`CREATE TRIGGER messages_ai AFTER INSERT ON messages WHEN new.type = 'message'
            BEGIN INSERT INTO messages_fts(rowid, text) VALUES (new.id, json_extract(new.msg, '$.text')); END`,
		`CREATE TRIGGER messages_ad AFTER DELETE ON messages WHEN old.type = 'message'
            BEGIN DELETE FROM messages_fts WHERE rowid = old.id; END`,
	];

	const legacyUserName = "legacyForkRepairTestUser";
	const legacyPath = path.join(Config.getHomePath(), "logs", `${legacyUserName}.sqlite3`);
	const legacySidecarPath = path.join(
		Config.getHomePath(),
		"logs",
		`${legacyUserName}.fts.sqlite3`
	);

	afterEach(function () {
		if (fs.existsSync(legacyPath)) {
			fs.unlinkSync(legacyPath);
		}

		if (fs.existsSync(legacySidecarPath)) {
			fs.unlinkSync(legacySidecarPath);
		}
	});

	it("repairs a main file this fork previously upgraded, without losing search", async function () {
		fs.mkdirSync(path.join(Config.getHomePath(), "logs"), {recursive: true});

		const legacyDb = new Database(legacyPath);

		for (const stmt of legacyMainSchema) {
			legacyDb.prepare(stmt).run();
		}

		legacyDb
			.prepare("INSERT INTO options(name, value) VALUES ('schema_version', '1788000000000')")
			.run();

		const insertMsg = legacyDb.prepare(
			"INSERT INTO messages(network, channel, time, type, msg) VALUES (?, ?, ?, ?, ?)"
		);

		for (let i = 0; i < 5; i++) {
			insertMsg.run(
				"legacy-net",
				"#legacy",
				1600000000000 + i,
				"message",
				JSON.stringify({text: `legacy message ${i}`, from: {nick: "old"}})
			);
		}

		legacyDb.close();

		const store = new MessageStorage(legacyUserName);
		await store.enable();

		try {
			const optRow = store.database
				.prepare("SELECT value FROM options WHERE name = 'schema_version'")
				.get() as Record<string, unknown>;
			expect(optRow.value).to.equal(currentSchemaVersion.toString());

			const ftsTable = store.database
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'"
				)
				.get();
			expect(ftsTable).to.equal(undefined);

			const triggers = store.database
				.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
				.all();
			expect(triggers).to.have.lengthOf(0);

			const legacyMigrationRows = store.database
				.prepare(
					"SELECT version FROM migrations WHERE version IN (1785000000000, 1788000000000)"
				)
				.all();
			expect(legacyMigrationRows).to.have.lengthOf(0);

			// End-to-end: the sidecar copy actually worked, not just that the
			// main file got cleaned up.
			const results = await store.search({
				searchTerm: "legacy",
				networkUuid: "legacy-net",
				channelName: "",
				offset: 0,
			});
			expect(results.results).to.have.lengthOf(5);
		} finally {
			await store.close();
		}
	});
});

function dateAddDays(date: Date, days: number) {
	const ret = new Date(date.valueOf());
	ret.setDate(date.getDate() + days);
	return ret;
}
