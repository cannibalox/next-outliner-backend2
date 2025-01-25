import Database, {
  type Database as SqliteDatabase,
  SqliteError,
} from "better-sqlite3";
import { LoroDoc } from "loro-crdt";
import { captureError } from "../../../error";
import { LoroDocPersister } from "../interface/persister";
import fs from "fs";

const tableExists = (db: SqliteDatabase, tableName: string) => {
  const sql = `SELECT name FROM sqlite_master WHERE type='table' AND name=?;`;
  const result = db.prepare(sql).pluck().get(tableName);
  return result != null;
};

const encodeDocId = (docId: string): string => {
  return docId.replace(/[^a-zA-Z0-9_]/g, (char) => {
    return `_x${char.charCodeAt(0).toString(16)}_`;
  });
};

const decodeDocId = (encodedDocId: string): string => {
  return encodedDocId.replace(/_x([0-9a-fA-F]+)_/g, (_, charCode) => {
    return String.fromCharCode(parseInt(charCode, 16));
  });
};

const getSnapshotTableName = (docId: string) =>
  `doc_snapshot_${encodeDocId(docId)}`;
const getUpdatesTableName = (docId: string) =>
  `doc_updates_${encodeDocId(docId)}`;

export class SqliteLoroDocPersister implements LoroDocPersister {
  private dbs: Map<string, SqliteDatabase> = new Map(); // location -> db

  private _openExistedDb(location: string): SqliteDatabase {
    let db = this.dbs.get(location);
    if (!db) {
      db = new Database(location, { fileMustExist: true });
      this.dbs.set(location, db);
    }
    return db;
  }

  async ensureDoc(
    docId: string,
    location: string,
    snapshot?: Uint8Array,
    updates?: Uint8Array[],
  ) {
    const result = captureError(
      () => this._openExistedDb(location),
      (e) => e instanceof SqliteError && e.code === "SQLITE_CANTOPEN",
    );
    const snapshotTableName = getSnapshotTableName(docId);
    const updatesTableName = getUpdatesTableName(docId);
    if (result.type === "err") {
      // 如果数据库不存在，则创建新数据库
      const db = new Database(location, { fileMustExist: false });
      db.prepare(
        `CREATE TABLE ${snapshotTableName} (snapshot BLOB NOT NULL)`,
      ).run();
      db.prepare(
        `CREATE TABLE ${updatesTableName} (update_ BLOB NOT NULL)`,
      ).run();
      // 插入初始 snapshot
      snapshot ??= new LoroDoc().export({ mode: "snapshot" });
      const snapshotBuffer = Buffer.from(snapshot);
      db.prepare(`INSERT INTO ${snapshotTableName} (snapshot) VALUES (?)`).run(
        snapshotBuffer,
      );
      // 插入初始 updates
      updates ??= [];
      if (updates.length > 0) {
        const stmt = db.prepare(
          `INSERT INTO ${updatesTableName} (update_) VALUES (?)`,
        );
        const insertMany = db.transaction((updates) => {
          for (const update of updates) {
            stmt.run(Buffer.from(update));
          }
        });
        insertMany(updates);
      }
      this.dbs.set(location, db);
    } else {
      // 数据库已经存在，则确保相关表存在
      const db = result.value;
      // 如果 snapshot 表不存在，则创建
      if (!tableExists(db, snapshotTableName)) {
        db.prepare(
          `CREATE TABLE ${snapshotTableName} (snapshot BLOB NOT NULL)`,
        ).run();
        // 插入初始 snapshot
        snapshot ??= new LoroDoc().export({ mode: "snapshot" });
        const snapshotBuffer = Buffer.from(snapshot);
        db.prepare(
          `INSERT INTO ${snapshotTableName} (snapshot) VALUES (?)`,
        ).run(snapshotBuffer);
      } else {
        // 如果 snapshot 表存在，但为空
        const firstRowId = db
          .prepare(`SELECT rowid FROM ${snapshotTableName} LIMIT 1`)
          .pluck()
          .get();
        if (firstRowId == null) {
          // 插入初始 snapshot
          snapshot ??= new LoroDoc().export({ mode: "snapshot" });
          const snapshotBuffer = Buffer.from(snapshot);
          db.prepare(
            `INSERT INTO ${snapshotTableName} (snapshot) VALUES (?)`,
          ).run(snapshotBuffer);
        }
      }
      // 如果 updates 表不存在，则创建
      if (!tableExists(db, updatesTableName)) {
        db.prepare(
          `CREATE TABLE ${updatesTableName} (update_ BLOB NOT NULL)`,
        ).run();
      }
    }
  }

  async docExists(docId: string, location: string) {
    const db = this._openExistedDb(location);
    const snapshotTableName = getSnapshotTableName(docId);
    const updatesTableName = getUpdatesTableName(docId);
    return (
      tableExists(db, snapshotTableName) && tableExists(db, updatesTableName)
    );
  }

  async getAllDocIds(location: string) {
    const db = this._openExistedDb(location);
    const allTableNames = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .pluck()
      .all() as string[];
    return allTableNames
      .filter((name) => name.startsWith("doc_snapshot_"))
      .map((name) => name.replace("doc_snapshot_", ""))
      .map((name) => decodeDocId(name));
  }

  async deleteDoc(docId: string, location: string) {
    const db = this._openExistedDb(location);
    const snapshotTableName = getSnapshotTableName(docId);
    const updatesTableName = getUpdatesTableName(docId);
    db.prepare(`DROP TABLE IF EXISTS ${snapshotTableName}`).run();
    db.prepare(`DROP TABLE IF EXISTS ${updatesTableName}`).run();
    this.dbs.delete(location);
  }

  async loadSnapshot(docId: string, location: string) {
    const db = this._openExistedDb(location);
    const snapshotTableName = getSnapshotTableName(docId);
    const snapshot = db
      .prepare(`SELECT snapshot FROM ${snapshotTableName}`)
      .pluck()
      .get() as Buffer;
    return snapshot;
  }

  async loadUpdates(docId: string, location: string) {
    const db = this._openExistedDb(location);
    const updatesTableName = getUpdatesTableName(docId);
    const updates = db
      .prepare(`SELECT update_ FROM ${updatesTableName}`)
      .pluck()
      .all() as Buffer[];
    return updates;
  }

  async loadBatch(docId: string, location: string, doc: LoroDoc) {
    const snapshot = await this.loadSnapshot(docId, location);
    const updates = await this.loadUpdates(docId, location);
    doc.importBatch([snapshot, ...updates]);
  }

  async saveSnapshot(docId: string, location: string, snapshot: Uint8Array) {
    const db = this._openExistedDb(location);
    const snapshotTableName = getSnapshotTableName(docId);
    const updatesTableName = getUpdatesTableName(docId);
    const snapshotBuffer = Buffer.from(snapshot);
    db.prepare(`UPDATE ${snapshotTableName} SET snapshot = ?`).run(
      snapshotBuffer,
    );
    db.prepare(`DELETE FROM ${updatesTableName}`).run();
  }

  async shrinkDoc(docId: string, location: string, vacuum: boolean = true) {
    const db = this._openExistedDb(location);
    const beforeSize = fs.statSync(location).size;
    const doc = new LoroDoc();
    await this.loadBatch(docId, location, doc);
    await this.saveSnapshot(docId, location, doc.export({ mode: "snapshot" }));
    if (vacuum) {
      db.exec(`VACUUM`); // 压缩数据库
    }
    const afterSize = fs.statSync(location).size;
    return { beforeSize, afterSize };
  }

  async shrinkAll(location: string, vacuum: boolean = true) {
    const db = this._openExistedDb(location);
    const beforeSize = fs.statSync(location).size;
    const allDocIds = await this.getAllDocIds(location);
    for (const docId of allDocIds) {
      const doc = new LoroDoc();
      await this.loadBatch(docId, location, doc);
      await this.saveSnapshot(
        docId,
        location,
        doc.export({ mode: "snapshot" }),
      );
    }
    db.exec(`VACUUM`); // 压缩数据库
    const afterSize = fs.statSync(location).size;
    return { beforeSize, afterSize };
  }

  async saveUpdates(docId: string, location: string, updates: Uint8Array[]) {
    const db = this._openExistedDb(location);
    const updatesTableName = getUpdatesTableName(docId);
    const updatesBuffer = updates.map((update) => Buffer.from(update));
    db.transaction((updates) => {
      const stmt = db.prepare(
        `INSERT INTO ${updatesTableName} (update_) VALUES (?)`,
      );
      for (const update of updates) {
        stmt.run(update);
      }
    })(updatesBuffer);
  }

  async destroy() {
    for (const db of this.dbs.values()) {
      db.close();
    }
    this.dbs.clear();
  }
}
