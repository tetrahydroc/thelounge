import Database from "better-sqlite3";

import log from "../../log.js";
import path from "path";
import fs from "fs/promises";
import Config from "../../config.js";
import Msg, {Message} from "../../models/msg.js";
import Chan, {Channel} from "../../models/chan.js";
import Helper from "../../helper.js";
import type {SearchableMessageStorage, DeletionRequest} from "./types.js";
import Network from "../../models/network.js";
import {SearchQuery, SearchResponse} from "../../../shared/types/storage.js";
import {MessageType} from "../../../shared/types/msg.js";

type Migration = {version: number; stmts: string[]};
type Rollback = {version: number; rollback_forbidden?: boolean; stmts: string[]};

// Pinned at the schema version this fork inherited from tetrahydroc/thelounge
// ("tetra") at the point it diverged - NOT bumped further, on purpose. Tetra's
// own run_migrations() refuses to open a DB whose schema_version is higher
// than its own currentSchemaVersion, so keeping this file's main schema
// permanently tetra-shaped is what keeps the main .sqlite3 file openable by
// tetra at any time. This fork's own FTS5 search index lives entirely in a
// separate sidecar file instead (see the hori* constants and ensureSidecarSchema
// below) - see MIGRATION.md for the full rationale.
export const currentSchemaVersion = 1703322560448; // use `new Date().getTime()`

// The highest schema_version this fork itself ever wrote to the main file
// before the sidecar refactor (1785000000000: composite index, 1788000000000:
// FTS5). Distinguishes "a DB this fork wrote earlier, safe to repair in place"
// from "a genuinely unknown/future version" (still refused, preserving
// tetra's original safety guard in run_migrations()) - see repairLegacyForkSchema.
export const legacyForkMaxSchemaVersion = 1788000000000;

// Desired schema, adapt to the newest version and add migrations to the array below.
// Deliberately matches tetra's own end-state exactly - nothing fork-specific
// belongs here. Fork-only objects (FTS5) live in the sidecar schema below.
const schema = [
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
	"CREATE INDEX msg_type_idx on messages (type)", // needed for efficient storageCleaner queries
];

// Fork-only, sidecar-scoped schema - never touches the main .sqlite3 file.
// The sidecar is disposable (safe to delete; gets rebuilt from `messages` on
// the next enable()), so its own migration bookkeeping lives inside itself:
// deleting the sidecar and resetting hori_ext_version to 0 are the same
// event by construction, with no extra invariant to maintain elsewhere.
const horiSchema = [
	"CREATE TABLE IF NOT EXISTS fts.hori_options (name TEXT, value TEXT, CONSTRAINT name_unique UNIQUE (name))",
	`CREATE TABLE IF NOT EXISTS fts.hori_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER NOT NULL UNIQUE,
        rollback_forbidden INTEGER DEFAULT 0 NOT NULL
    )`,
	`CREATE TABLE IF NOT EXISTS fts.hori_rollback_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_id INTEGER NOT NULL REFERENCES hori_migrations ON DELETE CASCADE,
        step INTEGER NOT NULL,
        statement TEXT NOT NULL
    )`,
	// FTS5 trigram index over message text, so search() can use LIKE '%term%' against
	// an index instead of a full table scan of json_extract(msg, '$.text').
	// Not an external-content table: FTS5's automatic content lookup requires a
	// same-named column in the content table, but text lives inside the main
	// file's msg JSON blob. detail=none is safe since we only ever use LIKE,
	// never bm25()/snippet/highlight.
	"CREATE VIRTUAL TABLE IF NOT EXISTS fts.messages_fts USING fts5(text, tokenize='trigram', detail=none)",
];

// This fork's own extensible migration path for anything sidecar-scoped -
// evolves independently of currentSchemaVersion above, which must stay
// pinned. Baseline only for now (horiSchema above creates the v1 shape
// directly, mirroring how setup_new_db() uses `schema` directly rather than
// replaying migrations[0]); add future entries here the same way `migrations`
// grows, e.g. to change the FTS tokenizer - see ensureSidecarSchema.
export const horiCurrentVersion = 1;
export const horiMigrations: Migration[] = [{version: 1, stmts: []}];
export const horiRollbacks: Rollback[] = [{version: 1, stmts: []}];

// the migrations will be executed in an exclusive transaction as a whole
// add new migrations to the end, with the version being the new 'currentSchemaVersion'
// write a corresponding down migration into rollbacks
export const migrations: Migration[] = [
	{
		version: 1672236339873,
		stmts: [
			"CREATE TABLE messages_new (id INTEGER PRIMARY KEY AUTOINCREMENT, network TEXT, channel TEXT, time INTEGER, type TEXT, msg TEXT)",
			"INSERT INTO messages_new(network, channel, time, type, msg) select network, channel, time, type, msg from messages order by time asc",
			"DROP TABLE messages",
			"ALTER TABLE messages_new RENAME TO messages",
			"CREATE INDEX network_channel ON messages (network, channel)",
			"CREATE INDEX time ON messages (time)",
		],
	},
	{
		version: 1679743888000,
		stmts: [
			`CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL UNIQUE,
                rollback_forbidden INTEGER DEFAULT 0 NOT NULL
            )`,
			`CREATE TABLE IF NOT EXISTS rollback_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                migration_id INTEGER NOT NULL REFERENCES migrations ON DELETE CASCADE,
                step INTEGER NOT NULL,
                statement TEXT NOT NULL
            )`,
		],
	},
	{
		version: 1703322560448,
		stmts: ["CREATE INDEX msg_type_idx on messages (type)"],
	},
];

// down migrations need to restore the state of the prior version.
// rollback can be disallowed by adding rollback_forbidden: true to it
export const rollbacks: Rollback[] = [
	{
		version: 1672236339873,
		stmts: [], // changes aren't visible, left empty on purpose
	},
	{
		version: 1679743888000,
		stmts: [], // here we can't drop the tables, as we use them in the code, so just leave those in
	},
	{
		version: 1703322560448,
		stmts: ["drop INDEX msg_type_idx"],
	},
];

class Deferred {
	resolve!: () => void;
	promise: Promise<void>;

	constructor() {
		this.promise = new Promise((resolve) => {
			this.resolve = resolve;
		});
	}
}

type BatchedMessage = {
	network: string;
	channel: string;
	time: number;
	type: MessageType;
	msg: string;
	// Pre-extracted searchable text (same value the old trigger extracted via
	// json_extract(new.msg, '$.text')), captured here at push time so
	// flushBatch() can write straight into the sidecar FTS table without a
	// SQL round-trip. Only meaningful when type === MessageType.MESSAGE.
	text: string | null;
};

type SidecarSyncCounts = {
	mainCount: number;
	ftsCount: number;
	ftsMaxRowid: number;
	prefixCount: number;
};

type SidecarSyncPlan = {action: "append" | "rebuild"; fromId: number};

// Pure decision function (no I/O) so it's independently unit-testable.
// messages.id is a true AUTOINCREMENT column (ids are never reused after a
// delete), which is what makes this sound: every row ever present in
// messages_fts was inserted with rowid set to some id that was, at insertion
// time, a real type='message' row, so none of them can exceed ftsMaxRowid.
// If prefixCount (live type='message' rows with id <= ftsMaxRowid) equals
// ftsCount, the two sets have equal cardinality within a range whose
// membership can't silently swap identities - sufficient to conclude set
// equality without an explicit per-id diff, and license the cheap append
// path instead of a full rebuild. A mismatch means something was deleted
// (or otherwise changed) within the already-indexed range, which can only
// be safely recovered by a full rescan.
export function computeSidecarSyncPlan(counts: SidecarSyncCounts): SidecarSyncPlan {
	if (counts.prefixCount !== counts.ftsCount) {
		return {action: "rebuild", fromId: 0};
	}

	return {action: "append", fromId: counts.ftsMaxRowid};
}

class SqliteMessageStorage implements SearchableMessageStorage {
	isEnabled: boolean;
	database!: Database.Database;
	initDone: Deferred;
	userName: string;

	// Message batching for improved write performance
	private batchQueue: BatchedMessage[] = [];
	private batchSize = 50; // Flush after 50 messages
	private batchTimeout = 1000; // Flush after 1 second
	private batchTimer: NodeJS.Timeout | null = null;
	private insertStmt: Database.Statement | null = null;
	private ftsInsertStmt: Database.Statement | null = null;

	constructor(userName: string) {
		this.userName = userName;
		this.isEnabled = false;
		this.initDone = new Deferred();
	}

	private sidecarPathFor(connection_string: string): string {
		if (connection_string === ":memory:") {
			return ":memory:";
		}

		const dir = path.dirname(connection_string);
		const base = path.basename(connection_string, ".sqlite3");
		return path.join(dir, `${base}.fts.sqlite3`);
	}

	async _enable(connection_string: string) {
		try {
			this.database = new Database(connection_string);
			await this.run_pragmas(); // must be done outside of a transaction

			const sidecarPath = this.sidecarPathFor(connection_string);
			this.database.prepare("ATTACH DATABASE ? AS fts").run(sidecarPath);
			await this.serialize_run("PRAGMA fts.journal_mode = DELETE;");

			await this.ensureSidecarSchema();

			// Must run before the unconditional index below - on a brand-new
			// DB, `messages` doesn't exist until this creates it.
			const repaired = await this.run_migrations();

			// Unconditional and idempotent - not a tracked migration, since
			// tetra ignores indexes it doesn't know about. Replaces the old
			// 1785000000000 migration entry.
			await this.serialize_run(
				"CREATE INDEX IF NOT EXISTS network_channel_time ON messages (network, channel, time)"
			);

			if (!repaired) {
				await this.reconcileSidecar();
			}

			// Prepare insert statements for batching
			this.insertStmt = this.database.prepare(
				"INSERT INTO messages(network, channel, time, type, msg) VALUES(?, ?, ?, ?, ?)"
			);
			this.ftsInsertStmt = this.database.prepare(
				"INSERT INTO fts.messages_fts(rowid, text) VALUES (?, ?)"
			);
		} catch (e) {
			this.isEnabled = false;
			throw Helper.catch_to_error("Migration failed", e);
		}

		this.isEnabled = true;
	}

	async enable() {
		const logsPath = Config.getUserLogsPath();
		const sqlitePath = path.join(logsPath, `${this.userName}.sqlite3`);

		try {
			await fs.mkdir(logsPath, {recursive: true});
		} catch (e) {
			throw Helper.catch_to_error("Unable to create logs directory", e);
		}

		try {
			await this._enable(sqlitePath);
		} finally {
			this.initDone.resolve(); // unblock the instance methods
		}
	}

	async setup_new_db() {
		for (const stmt of schema) {
			await this.serialize_run(stmt);
		}

		await this.serialize_run(
			"INSERT INTO options (name, value) VALUES ('schema_version', ?)",
			currentSchemaVersion.toString()
		);
	}

	async current_version(): Promise<number> {
		const have_options = await this.serialize_get(
			"select 1 from sqlite_master where type = 'table' and name = 'options'"
		);

		if (!have_options) {
			return 0;
		}

		const version = await this.serialize_get(
			"SELECT value FROM options WHERE name = 'schema_version'"
		);

		if (version === undefined) {
			// technically shouldn't happen, means something created a schema but didn't populate it
			// we'll try our best to recover
			return 0;
		}

		const storedSchemaVersion = parseInt(
			(version as Record<string, unknown>).value as string,
			10
		);
		return storedSchemaVersion;
	}

	// Defaults to currentSchemaVersion for the upgrade path (_run_migrations,
	// which always migrates up to the running build's version); _downgrade_to
	// passes its own target explicitly - it must NOT fall back to
	// currentSchemaVersion, or a downgrade would drop the schema objects but
	// then mislabel the DB as still being at the newer version, which both
	// defeats downgrading for compatibility with older code (which would see
	// a version newer than itself and refuse to start) and would silently
	// stop this build's own upgrade path from ever recreating what was
	// dropped (current_version() === currentSchemaVersion looks up to date).
	async update_version_in_db(version: number = currentSchemaVersion) {
		return this.serialize_run(
			"UPDATE options SET value = ? WHERE name = 'schema_version'",
			version.toString()
		);
	}

	async _run_migrations(dbVersion: number) {
		log.info(
			`sqlite messages schema version is out of date (${dbVersion} < ${currentSchemaVersion}). Running migrations.`
		);

		const to_execute = necessaryMigrations(dbVersion);

		for (const stmt of to_execute.map((m) => m.stmts).flat()) {
			await this.serialize_run(stmt);
		}

		await this.update_version_in_db();
	}

	async run_pragmas() {
		await this.serialize_run("PRAGMA foreign_keys = ON;");

		// Deliberately NOT WAL: writes now span both this file and the
		// attached FTS sidecar in a single transaction (flushBatch, deletes,
		// repair), and SQLite's cross-database ATTACH transactions are only
		// atomic when none of the participating databases are in WAL mode -
		// WAL's per-file log has no cross-file equivalent to the classic
		// rollback-journal mode's multi-file super-journal coordination.
		// WAL's actual benefit (concurrent readers not blocked by a writer)
		// has no real payoff here anyway: one connection per user, one
		// process, nothing else contends for the file. FULL synchronous
		// (rather than WAL-safe NORMAL) is required in lockstep for the same
		// reason - NORMAL's corruption-safety guarantee specifically depends
		// on WAL.
		await this.serialize_run("PRAGMA journal_mode = DELETE;");
		await this.serialize_run("PRAGMA synchronous = FULL;");
	}

	// Returns true if the legacy-fork repair path ran (in which case the
	// sidecar is already fully reconciled as part of that same transaction,
	// and _enable() should skip the separate reconcileSidecar() staleness
	// check), false otherwise (ordinary fresh-DB/upgrade/no-op path).
	async run_migrations(): Promise<boolean> {
		const version = await this.current_version();

		if (version > currentSchemaVersion) {
			if (version <= legacyForkMaxSchemaVersion) {
				// Not a foreign/newer DB - this fork's own earlier code wrote
				// this schema_version before the sidecar refactor. Repair
				// in place rather than refusing to open it.
				await this.repairLegacyForkSchema(version);
				return true;
			}

			throw new Error(
				`sqlite messages schema version is higher than expected (${version} > ${currentSchemaVersion}). Is NexusIRC out of date?`
			);
		} else if (version === currentSchemaVersion) {
			return false; // nothing to do - the common case
		}

		await this.serialize_run("BEGIN EXCLUSIVE TRANSACTION");

		try {
			if (version === 0) {
				await this.setup_new_db();
			} else {
				await this._run_migrations(version);
			}

			await this.insert_rollback_since(version);
		} catch (err) {
			await this.serialize_run("ROLLBACK");
			throw err;
		}

		await this.serialize_run("COMMIT");
		await this.serialize_run("VACUUM");

		return false;
	}

	// One-time repair of a main file this fork itself upgraded past
	// currentSchemaVersion before the sidecar refactor - not a tracked
	// migration. Copies the leftover messages_fts straight into the sidecar
	// (a table-to-table copy, not a JSON rescan - cheap, proportional to
	// index size not message count), then strips the leftover fork-only
	// objects from the main file and re-pins schema_version. Runs in one
	// transaction spanning both files (genuinely atomic - see run_pragmas).
	async repairLegacyForkSchema(fromVersion: number) {
		log.info(
			`sqlite messages schema version ${fromVersion} is a legacy fork version - repairing to stay compatible with tetra (${currentSchemaVersion}).`
		);

		await this.serialize_run("BEGIN EXCLUSIVE TRANSACTION");

		try {
			await this.serialize_run(
				"INSERT INTO fts.messages_fts(rowid, text) SELECT rowid, text FROM messages_fts"
			);
			await this.serialize_run("DROP TRIGGER IF EXISTS messages_ad");
			await this.serialize_run("DROP TRIGGER IF EXISTS messages_ai");
			await this.serialize_run("DROP TABLE IF EXISTS messages_fts");
			await this.serialize_run(
				"DELETE FROM migrations WHERE version IN (1785000000000, 1788000000000)"
			);
			await this.update_version_in_db(currentSchemaVersion);
		} catch (err) {
			await this.serialize_run("ROLLBACK");
			throw err;
		}

		await this.serialize_run("COMMIT");
		await this.serialize_run("VACUUM");

		log.info(`sqlite messages schema repaired to ${currentSchemaVersion}.`);
	}

	// Sidecar's own schema + tiny independent migration pass, keyed on
	// hori_ext_version rather than schema_version - see horiCurrentVersion's
	// declaration for why this exists as a separate mechanism.
	async ensureSidecarSchema() {
		for (const stmt of horiSchema) {
			await this.serialize_run(stmt);
		}

		const have_options = await this.serialize_get(
			"select 1 from sqlite_master where type = 'table' and name = 'hori_options'"
		);

		if (!have_options) {
			return; // just created by horiSchema above via IF NOT EXISTS - unreachable in practice
		}

		const row = await this.serialize_get(
			"SELECT value FROM fts.hori_options WHERE name = 'hori_ext_version'"
		);

		if (row === undefined) {
			await this.serialize_run(
				"INSERT INTO fts.hori_options (name, value) VALUES ('hori_ext_version', ?)",
				horiCurrentVersion.toString()
			);
			return;
		}

		const storedVersion = parseInt((row as Record<string, unknown>).value as string, 10);

		if (storedVersion >= horiCurrentVersion) {
			return;
		}

		const toExecute = horiMigrations.filter((m) => m.version > storedVersion);

		for (const stmt of toExecute.map((m) => m.stmts).flat()) {
			await this.serialize_run(stmt);
		}

		await this.serialize_run(
			"UPDATE fts.hori_options SET value = ? WHERE name = 'hori_ext_version'",
			horiCurrentVersion.toString()
		);
	}

	// Detects and fixes drift between `messages` and the sidecar's
	// messages_fts (e.g. tetra was run against the main file for a while,
	// or the sidecar was deleted) - see computeSidecarSyncPlan for the
	// detection logic.
	async reconcileSidecar() {
		const mainCountRow = await this.serialize_get(
			"SELECT COUNT(*) as c FROM messages WHERE type = 'message'"
		);
		const mainCount = (mainCountRow as Record<string, unknown>).c as number;

		const ftsMaxRow = await this.serialize_get(
			"SELECT COALESCE(MAX(rowid), 0) as c FROM fts.messages_fts"
		);
		const ftsMaxRowid = (ftsMaxRow as Record<string, unknown>).c as number;

		const ftsCountRow = await this.serialize_get("SELECT COUNT(*) as c FROM fts.messages_fts");
		const ftsCount = (ftsCountRow as Record<string, unknown>).c as number;

		const prefixCountRow = await this.serialize_get(
			"SELECT COUNT(*) as c FROM messages WHERE type = 'message' AND id <= ?",
			ftsMaxRowid
		);
		const prefixCount = (prefixCountRow as Record<string, unknown>).c as number;

		if (mainCount === 0 && ftsCount === 0) {
			return; // nothing to do, fast path for the common empty/fresh case
		}

		const plan = computeSidecarSyncPlan({mainCount, ftsCount, ftsMaxRowid, prefixCount});

		if (plan.action === "append") {
			if (mainCount === ftsCount) {
				return; // already in sync, nothing to append
			}

			await this.catchUpSidecarAppend(plan.fromId);
		} else {
			await this.fullRebuildSidecar();
		}
	}

	// Cheap path: the sidecar is just missing a tail of newer rows (a pure
	// append happened since it was last built/synced) - insert only those.
	async catchUpSidecarAppend(fromId: number) {
		log.info(
			`sqlite fts sidecar for ${this.userName} is missing recent messages, catching up.`
		);

		await this.serialize_run(
			`INSERT INTO fts.messages_fts(rowid, text)
             SELECT id, json_extract(msg, '$.text') FROM messages
             WHERE type = 'message' AND id > ?`,
			fromId
		);

		log.info(`sqlite fts sidecar for ${this.userName} caught up.`);
	}

	// Expensive path: something was deleted (or otherwise changed) within
	// the already-indexed range, so a per-id diff can't be trusted - wipe
	// and rebuild from scratch. Proportional to total message count; this
	// fork measured ~2.7 minutes on ~7.29M rows.
	async fullRebuildSidecar() {
		log.info(
			`sqlite fts sidecar for ${this.userName} is out of sync, rebuilding - this can take minutes on large message histories.`
		);

		await this.serialize_run("DELETE FROM fts.messages_fts");
		await this.serialize_run(
			`INSERT INTO fts.messages_fts(rowid, text)
             SELECT id, json_extract(msg, '$.text') FROM messages WHERE type = 'message'`
		);

		log.info(`sqlite fts sidecar for ${this.userName} rebuilt.`);
	}

	// helper method that vacuums the db, meant to be used by migration related cli commands
	async vacuum() {
		await this.serialize_run("VACUUM");
	}

	async close() {
		if (!this.isEnabled) {
			return;
		}

		// Flush any pending batched messages
		await this.flushBatch();

		// Clear batch timer
		if (this.batchTimer) {
			clearTimeout(this.batchTimer);
			this.batchTimer = null;
		}

		this.isEnabled = false;

		try {
			this.database.prepare("DETACH DATABASE fts").run();
		} catch (err) {
			// Defensive/explicit only - better-sqlite3 already detaches
			// attached databases implicitly when the main connection closes.
			log.error(
				`Failed to detach fts sidecar: ${err instanceof Error ? err.message : String(err)}`
			);
		}

		try {
			this.database.close();
		} catch (err: unknown) {
			throw new Error(
				`Failed to close sqlite database: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	/**
	 * Flush batched messages to database using a transaction
	 */
	private async flushBatch(): Promise<void> {
		if (this.batchQueue.length === 0) {
			return Promise.resolve();
		}

		if (!this.insertStmt || !this.ftsInsertStmt) {
			log.error("Cannot flush batch: insert statement not prepared");
			return Promise.resolve();
		}

		const messages = this.batchQueue.splice(0); // Take all messages and clear queue

		try {
			// Use transaction for batch insert (much faster than individual inserts).
			// Spans both this file and the attached fts sidecar - genuinely
			// atomic since neither is in WAL mode (see run_pragmas): a thrown
			// error from either insert rolls back both, so the main DB can
			// never end up ahead of the sidecar.
			const transaction = this.database.transaction((msgs: BatchedMessage[]) => {
				for (const msg of msgs) {
					const info = this.insertStmt!.run(
						msg.network,
						msg.channel,
						msg.time,
						msg.type,
						msg.msg
					);

					if (msg.type === MessageType.MESSAGE) {
						this.ftsInsertStmt!.run(info.lastInsertRowid, msg.text);
					}
				}
			});

			transaction(messages);
		} catch (err) {
			log.error(
				`Failed to flush message batch: ${err instanceof Error ? err.message : String(err)}`
			);
			// Re-add messages to queue on failure
			this.batchQueue.unshift(...messages);
			throw err;
		}
	}

	/**
	 * Schedule a batch flush
	 */
	private scheduleBatchFlush(): void {
		if (this.batchTimer) {
			return; // Timer already scheduled
		}

		this.batchTimer = setTimeout(() => {
			this.batchTimer = null;
			this.flushBatch().catch((err) => log.error(`Batch flush error: ${err}`));
		}, this.batchTimeout);
	}

	async fetch_rollbacks(since_version: number) {
		const res = await this.serialize_fetchall(
			`select version, rollback_forbidden, statement
            from rollback_steps
            join migrations on migrations.id=rollback_steps.migration_id
            where version > ?
            order by version desc, step asc`,
			since_version
		);
		const result: Rollback[] = [];

		// convert to Rollback[]
		// requires ordering in the sql statement
		for (const raw of res) {
			const last = result.at(-1);

			const r = raw as Record<string, unknown>;

			if (!last || r.version !== last.version) {
				result.push({
					version: r.version as number,
					rollback_forbidden: Boolean(r.rollback_forbidden),
					stmts: [r.statement as string],
				});
			} else {
				last.stmts.push(r.statement as string);
			}
		}

		return result;
	}

	async delete_migrations_older_than(version: number) {
		return this.serialize_run("delete from migrations where migrations.version > ?", version);
	}

	async _downgrade_to(version: number) {
		const _rollbacks = await this.fetch_rollbacks(version);

		if (_rollbacks.length === 0) {
			return version;
		}

		const forbidden = _rollbacks.find((item) => item.rollback_forbidden);

		if (forbidden) {
			throw Error(`can't downgrade past ${forbidden.version}`);
		}

		for (const rollback of _rollbacks) {
			for (const stmt of rollback.stmts) {
				await this.serialize_run(stmt);
			}
		}

		await this.delete_migrations_older_than(version);
		await this.update_version_in_db(version);

		return version;
	}

	async downgrade_to(version: number) {
		if (version <= 0) {
			throw Error(`${version} is not a valid version to downgrade to`);
		}

		await this.serialize_run("BEGIN EXCLUSIVE TRANSACTION");

		let new_version: number;

		try {
			new_version = await this._downgrade_to(version);
		} catch (err) {
			await this.serialize_run("ROLLBACK");
			throw err;
		}

		await this.serialize_run("COMMIT");
		return new_version;
	}

	async downgrade() {
		const res = await this.downgrade_to(currentSchemaVersion);
		return res;
	}

	async insert_rollback_since(version: number) {
		const missing = newRollbacks(version);

		for (const rollback of missing) {
			const migration = await this.serialize_get(
				`insert into migrations
                (version, rollback_forbidden)
                values (?, ?)
                returning id`,
				rollback.version,
				rollback.rollback_forbidden || 0
			);

			for (const stmt of rollback.stmts) {
				let step = 0;
				await this.serialize_run(
					`insert into rollback_steps
                    (migration_id, step, statement)
                    values (?, ?, ?)`,
					(migration as Record<string, unknown>).id,
					step,
					stmt
				);
				step++;
			}
		}
	}

	async index(network: Network, channel: Chan, msg: Msg) {
		await this.initDone.promise;

		if (!this.isEnabled) {
			return;
		}

		const clonedMsg = Object.keys(msg).reduce((newMsg, prop) => {
			// previews are not stored because storage is cleared on lounge restart
			// type and time are stored in a separate column
			// id IS now stored so it can be retrieved consistently
			if (prop !== "previews" && prop !== "type" && prop !== "time") {
				newMsg[prop] = msg[prop];
			}

			return newMsg;
		}, {});

		// Add to batch queue instead of immediate insert
		this.batchQueue.push({
			network: network.uuid,
			channel: channel.name.toLowerCase(),
			time: msg.time.getTime(),
			type: msg.type,
			msg: JSON.stringify(clonedMsg),
			text: typeof msg.text === "string" ? msg.text : null,
		});

		// Flush batch if it reaches the size limit
		if (this.batchQueue.length >= this.batchSize) {
			await this.flushBatch();
		} else {
			// Schedule flush after timeout
			this.scheduleBatchFlush();
		}
	}

	async deleteChannel(network: Network, channel: Channel) {
		await this.initDone.promise;

		if (!this.isEnabled) {
			return;
		}

		// No trigger to cascade this anymore (see run_pragmas/schema comments -
		// triggers writing to the sidecar would break tetra's own inserts),
		// so delete from the sidecar explicitly. One transaction across both
		// files - genuinely atomic since neither is WAL (see run_pragmas).
		const transaction = this.database.transaction((uuid: string, name: string) => {
			this.database
				.prepare(
					"DELETE FROM fts.messages_fts WHERE rowid IN (SELECT id FROM messages WHERE network = ? AND channel = ?)"
				)
				.run(uuid, name);
			this.database
				.prepare("DELETE FROM messages WHERE network = ? AND channel = ?")
				.run(uuid, name);
		});

		transaction(network.uuid, channel.name.toLowerCase());
	}

	async getMessages(
		network: Network,
		channel: Channel,
		ensureIdAbove: (maxId: number) => void
	): Promise<Message[]> {
		await this.initDone.promise;

		if (!this.isEnabled || Config.values.maxHistory === 0) {
			return [];
		}

		// Flush any pending batched writes before reading
		await this.flushBatch();

		// If unlimited history is specified, load 100k messages
		const limit = Config.values.maxHistory < 0 ? 100000 : Config.values.maxHistory;

		// Select id from SQLite to use as the canonical message ID
		const rows = await this.serialize_fetchall(
			"SELECT id, msg, type, time FROM messages WHERE network = ? AND channel = ? ORDER BY time DESC, id DESC LIMIT ?",
			network.uuid,
			channel.name.toLowerCase(),
			limit
		);

		// Track max ID so we can update client.idMsg
		let maxId = 0;

		const messages = rows.reverse().map((row): Message => {
			const r = row as Record<string, unknown>;
			const msg = JSON.parse(r.msg as string);
			msg.time = r.time;
			msg.type = r.type;

			const newMsg = new Msg(msg);

			// Use ID from stored JSON if available (new messages)
			// Fall back to SQLite row ID for old messages without stored ID
			if (typeof msg.id === "number") {
				newMsg.id = msg.id;
			} else {
				newMsg.id = r.id as number;
			}

			if (newMsg.id > maxId) {
				maxId = newMsg.id;
			}

			return newMsg;
		});

		// Ensure client.idMsg is higher than any loaded message ID
		ensureIdAbove(maxId);

		return messages;
	}

	async search(query: SearchQuery): Promise<SearchResponse> {
		await this.initDone.promise;

		if (!this.isEnabled) {
			// this should never be hit as messageProvider is checked in client.search()
			throw new Error(
				"search called but sqlite provider not enabled. This is a programming error"
			);
		}

		// Flush any pending batched writes before searching
		await this.flushBatch();

		const searchTermParts = query.searchTerm.split(" ");

		let userFilter: string | null = null;
		let dateEndFilter: number | null = null;
		let dateStartFilter: number | null = null;

		for (const part of [...searchTermParts]) {
			if (part.startsWith("from:") && userFilter === null) {
				userFilter = part.slice(5);
				searchTermParts.splice(searchTermParts.indexOf(part), 1);
			}

			if (part.startsWith("datebefore:") && dateEndFilter === null) {
				const dateStr = part.slice(11);
				const date = new Date(dateStr);

				if (!Number.isNaN(date.getTime())) {
					dateEndFilter = date.getTime();
					searchTermParts.splice(searchTermParts.indexOf(part), 1);
				}
			}

			if (part.startsWith("dateafter:") && dateStartFilter === null) {
				const dateStr = part.slice(10);
				const date = new Date(dateStr);

				if (!Number.isNaN(date.getTime())) {
					dateStartFilter = date.getTime();
					searchTermParts.splice(searchTermParts.indexOf(part), 1);
				}
			}
		}

		// Using the '@' character to escape '%' and '_' in patterns.
		const escapedSearchTerm = searchTermParts.join(" ").replace(/([%_@])/g, "@$1");

		let select =
			"SELECT m.id, m.msg, m.type, m.time, m.network, m.channel FROM fts.messages_fts f JOIN messages m ON m.id = f.rowid WHERE f.text LIKE ? ESCAPE '@'";
		const params: unknown[] = [`%${escapedSearchTerm}%`];

		if (query.networkUuid) {
			select += " AND m.network = ? ";
			params.push(query.networkUuid);
		}

		if (query.channelName) {
			select += " AND m.channel = ? ";
			params.push(query.channelName.toLowerCase());
		}

		if (userFilter !== null) {
			select += " AND LOWER(json_extract(m.msg, '$.from.nick')) = ? ";
			params.push(userFilter.toLowerCase());
		}

		if (dateEndFilter !== null) {
			select += " AND m.time <= ? ";
			params.push(dateEndFilter);
		}

		if (dateStartFilter !== null) {
			select += " AND m.time >= ? ";
			params.push(dateStartFilter);
		}

		const maxResults = 100;

		select += " ORDER BY m.time DESC, m.id DESC LIMIT ? OFFSET ? ";
		params.push(maxResults);
		params.push(query.offset);

		const rows = await this.serialize_fetchall(select, ...params);
		return {
			...query,
			results: parseSearchRowsToMessages(rows).reverse(),
		};
	}

	async deleteMessages(req: DeletionRequest): Promise<number> {
		await this.initDone.promise;

		// Flush any pending batched writes before deleting
		await this.flushBatch();

		// We roughly get a timestamp from N days before.
		// We don't adjust for daylight savings time or other weird time jumps
		const millisecondsInDay = 24 * 60 * 60 * 1000;
		const deleteBefore = Date.now() - req.olderThanDays * millisecondsInDay;

		let sql = "select id from messages where time <= ?\n";
		const params: unknown[] = [deleteBefore];

		if (req.messageTypes !== null) {
			sql += `and type in (${req.messageTypes.map((type) => `'${type}'`).join(",")})\n`;
		}

		// Explicit id ASC secondary sort key: no trigger to cascade the
		// sidecar delete anymore, so the id list is materialized once here
		// and reused for both deletes below rather than re-issuing this
		// query twice and trusting matching tie-break order (SQLite doesn't
		// guarantee stable ordering for equal `time` values across two
		// separately-issued statements without one).
		sql += "order by time asc, id asc\n";
		sql += "limit ?";
		params.push(req.limit);

		const idRows = await this.serialize_fetchall(sql, ...params);
		const ids = idRows.map((row) => (row as Record<string, unknown>).id as number);

		if (ids.length === 0) {
			return 0;
		}

		const placeholders = ids.map(() => "?").join(",");

		// One transaction across both files - genuinely atomic since neither
		// is WAL (see run_pragmas).
		const transaction = this.database.transaction(() => {
			this.database
				.prepare(`DELETE FROM fts.messages_fts WHERE rowid IN (${placeholders})`)
				.run(...ids);
			this.database.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...ids);
		});

		transaction();

		return ids.length;
	}

	/**
	 * Get last N messages for a channel (for initial load)
	 */
	async getLastMessages(
		networkUuid: string,
		channelName: string,
		limit: number
	): Promise<Message[]> {
		await this.initDone.promise;

		if (!this.isEnabled) {
			return [];
		}

		// Flush any pending batched writes before reading
		await this.flushBatch();

		const rows = await this.serialize_fetchall(
			"SELECT msg, type, time FROM messages WHERE network = ? AND channel = ? ORDER BY time DESC, id DESC LIMIT ?",
			networkUuid,
			channelName.toLowerCase(),
			limit
		);

		return rows.reverse().map((row): Message => {
			const r = row as Record<string, unknown>;
			const msg = JSON.parse(r.msg as string);
			msg.time = r.time;
			msg.type = r.type;
			return new Msg(msg);
		});
	}

	/**
	 * Get messages before a specific timestamp (for lazy loading)
	 */
	async getMessagesBefore(
		networkUuid: string,
		channelName: string,
		beforeTime: number,
		limit: number,
		ensureIdAbove: (maxId: number) => void
	): Promise<Message[]> {
		await this.initDone.promise;

		if (!this.isEnabled) {
			return [];
		}

		// Flush any pending batched writes before reading
		await this.flushBatch();

		// "time <= ?" (not "<") so rows sharing the anchor's exact millisecond
		// are still returned: they dedupe away by id on both sides, but
		// skipping them would leave a permanent same-timestamp gap in the
		// client's loaded region (the anchor only ever moves older).
		const rows = await this.serialize_fetchall(
			"SELECT id, msg, type, time FROM messages WHERE network = ? AND channel = ? AND time <= ? ORDER BY time DESC, id DESC LIMIT ?",
			networkUuid,
			channelName.toLowerCase(),
			beforeTime,
			limit
		);

		let maxId = 0;

		const messages = rows.reverse().map((row): Message => {
			const r = row as Record<string, unknown>;
			const msg = JSON.parse(r.msg as string);
			msg.time = r.time;
			msg.type = r.type;

			// Use stored ID from JSON if available, fall back to SQLite row ID
			if (typeof msg.id !== "number") {
				msg.id = r.id as number;
			}

			if (msg.id > maxId) {
				maxId = msg.id;
			}

			return new Msg(msg);
		});

		// These rows can be for a channel that has never been loaded into
		// memory yet (lazy per-channel load), so client.idMsg may not have
		// seen these ids at all - bump it the same way getMessages() does.
		ensureIdAbove(maxId);

		return messages;
	}

	/**
	 * Get messages around a specific timestamp (for jumping to search results)
	 * Returns messages before and after the target time
	 */
	async getMessagesAround(
		networkUuid: string,
		channelName: string,
		targetTime: number,
		limit: number = 200,
		ensureIdAbove: (maxId: number) => void
	): Promise<{messages: Message[]; hasMoreBefore: boolean}> {
		await this.initDone.promise;

		if (!this.isEnabled) {
			return {messages: [], hasMoreBefore: false};
		}

		// Flush any pending batched writes before reading
		await this.flushBatch();

		const halfLimit = Math.floor(limit / 2);

		// Get messages before the target time. The `id DESC` tie-break
		// matters here specifically: a busy channel can land several
		// messages in the same millisecond, and without it SQLite breaks
		// ties in whatever order it pleases - which need not match the
		// target's actual position among its same-timestamp neighbors,
		// making a jump-to-message land next to the target rather than on
		// it. Ordering ties by id (insertion order) keeps this consistent
		// with how the client's own in-memory array is ordered.
		const beforeRows = await this.serialize_fetchall(
			"SELECT id, msg, type, time FROM messages WHERE network = ? AND channel = ? AND time <= ? ORDER BY time DESC, id DESC LIMIT ?",
			networkUuid,
			channelName.toLowerCase(),
			targetTime,
			halfLimit
		);

		// Get messages after the target time
		const afterRows = await this.serialize_fetchall(
			"SELECT id, msg, type, time FROM messages WHERE network = ? AND channel = ? AND time > ? ORDER BY time ASC, id ASC LIMIT ?",
			networkUuid,
			channelName.toLowerCase(),
			targetTime,
			halfLimit
		);

		// Combine: before (reversed) + after
		const allRows = [...beforeRows.reverse(), ...afterRows];

		let maxId = 0;

		const messages = allRows.map((row): Message => {
			const r = row as Record<string, unknown>;
			const msg = JSON.parse(r.msg as string);
			msg.time = r.time;
			msg.type = r.type;

			// Use stored ID from JSON if available, fall back to SQLite row ID
			if (typeof msg.id !== "number") {
				msg.id = r.id as number;
			}

			if (msg.id > maxId) {
				maxId = msg.id;
			}

			return new Msg(msg);
		});

		ensureIdAbove(maxId);

		// beforeRows filling its limit means the "time <= ?" query had more
		// rows to give than we asked for - i.e. there's more history before
		// the target regardless of how many (if any) rows came back after
		// it. A combined before+after row count can't tell these apart: a
		// target with abundant history before it but little/none after
		// (e.g. a fairly recent message) would otherwise be misreported as
		// "no more history", silently breaking "Show older messages" and
		// the scroll-triggered auto-load after jumping to a search result.
		const hasMoreBefore = beforeRows.length >= halfLimit;

		return {messages, hasMoreBefore};
	}

	/**
	 * Get total message count for a channel
	 */
	async getMessageCount(networkUuid: string, channelName: string): Promise<number> {
		await this.initDone.promise;

		if (!this.isEnabled) {
			return 0;
		}

		const row = await this.serialize_get(
			"SELECT COUNT(*) as count FROM messages WHERE network = ? AND channel = ?",
			networkUuid,
			channelName.toLowerCase()
		);

		return row ? ((row as Record<string, unknown>).count as number) : 0;
	}

	canProvideMessages() {
		return this.isEnabled;
	}

	private serialize_run(stmt: string, ...params: unknown[]): Promise<number> {
		try {
			const result = this.database.prepare(stmt).run(...params);
			return Promise.resolve(result.changes);
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}

	private serialize_fetchall(stmt: string, ...params: unknown[]): Promise<unknown[]> {
		try {
			const rows = this.database.prepare(stmt).all(...params);
			return Promise.resolve(rows);
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}

	private serialize_get(stmt: string, ...params: unknown[]): Promise<unknown> {
		try {
			const row = this.database.prepare(stmt).get(...params);
			return Promise.resolve(row);
		} catch (err) {
			return Promise.reject(err instanceof Error ? err : new Error(String(err)));
		}
	}
}

function parseSearchRowsToMessages(rows: unknown[]) {
	const messages: Msg[] = [];

	for (const row of rows) {
		const r = row as Record<string, unknown>;
		const msg = JSON.parse(r.msg as string);
		msg.time = r.time;
		msg.type = r.type;
		msg.networkUuid = r.network;
		msg.channelName = r.channel;

		// Use stored ID from JSON if available, fall back to SQLite row ID
		if (typeof msg.id !== "number") {
			msg.id = r.id as number;
		}

		messages.push(new Msg(msg));
	}

	return messages;
}

export function necessaryMigrations(since: number): Migration[] {
	return migrations.filter((m) => m.version > since);
}

export function newRollbacks(since: number): Rollback[] {
	return rollbacks.filter((r) => r.version > since);
}

export default SqliteMessageStorage;
