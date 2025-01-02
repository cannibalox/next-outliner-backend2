import { LoroDoc, VersionVector } from "loro-crdt";
import Database from "better-sqlite3";
import { type Database as SqliteDatabase, SqliteError } from "better-sqlite3";
import { captureError } from "../../../error";
import { LoroDocPersister } from "../interface/persister";

type LoroDocPersistController = {
  docId: string;
  lastSavedVersion: VersionVector;
  location: string;
  db: SqliteDatabase;
};

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

const getSnapshotTableName = (docId: string) =>
  `doc_snapshot_${encodeDocId(docId)}`;
const getUpdatesTableName = (docId: string) =>
  `doc_updates_${encodeDocId(docId)}`;

export class SqliteLoroDocPersister implements LoroDocPersister {
  private controllers: Map<string, LoroDocPersistController> = new Map();
  private dbs: Map<string, SqliteDatabase> = new Map(); // location -> db

  private _openExistedDb(location: string): SqliteDatabase {
    let db = this.dbs.get(location);
    if (!db) {
      db = new Database(location, { fileMustExist: true });
      this.dbs.set(location, db);
    }
    return db;
  }

  private _prepareDbForDoc(
    docId: string,
    doc: LoroDoc,
    location: string,
    createIfNotExists: boolean = false,
  ) {
    const result = captureError(
      () => this._openExistedDb(location),
      (e) => e instanceof SqliteError && e.code === "SQLITE_CANTOPEN",
    );
    const snapshotTableName = getSnapshotTableName(docId);
    const updatesTableName = getUpdatesTableName(docId);
    if (result.type === "err") {
      if (!createIfNotExists) {
        throw result.error; // db does not exist, and we don't want to create it
      }
      // db does not exist, create it
      const db = new Database(location, { fileMustExist: false });
      db.prepare(
        `CREATE TABLE ${snapshotTableName} (snapshot BLOB NOT NULL)`,
      ).run();
      db.prepare(
        `CREATE TABLE ${updatesTableName} (update_ BLOB NOT NULL)`,
      ).run();
      const snapshot = doc.export({ mode: "snapshot" });
      const snapshotBuffer = Buffer.from(snapshot);
      db.prepare(`INSERT INTO ${snapshotTableName} (snapshot) VALUES (?)`).run(
        snapshotBuffer,
      );
      this.dbs.set(location, db);
      return db;
    } else {
      // db existed, check if it contains tables for this doc
      const db = result.value;
      if (!tableExists(db, snapshotTableName)) {
        // snapshot table does not exist, create it
        const snapshot = doc.export({ mode: "snapshot" });
        const snapshotBuffer = Buffer.from(snapshot);
        db.prepare(
          `CREATE TABLE ${snapshotTableName} (snapshot BLOB NOT NULL)`,
        ).run();
        db.prepare(
          `INSERT INTO ${snapshotTableName} (snapshot) VALUES (?)`,
        ).run(snapshotBuffer);
      } else {
        // snapshot table exists, but empty, insert snapshot
        const fstRowId = db
          .prepare(`SELECT rowid FROM ${snapshotTableName}`)
          .pluck()
          .get();
        if (!fstRowId) {
          const snapshot = doc.export({ mode: "snapshot" });
          const snapshotBuffer = Buffer.from(snapshot);
          db.prepare(
            `INSERT INTO ${snapshotTableName} (snapshot) VALUES (?)`,
          ).run(snapshotBuffer);
        }
      }

      if (!tableExists(db, updatesTableName)) {
        // updates table does not exist, create it
        db.prepare(
          `CREATE TABLE ${updatesTableName} (update_ BLOB NOT NULL)`,
        ).run();
      }
      return db;
    }
  }

  private _loadSnapshotAndUpdates(db: SqliteDatabase, docId: string) {
    const snapshotTable = getSnapshotTableName(docId);
    const updatesTable = getUpdatesTableName(docId);
    const snapshot = db
      .prepare(`SELECT snapshot FROM ${snapshotTable}`)
      .pluck()
      .get() as Buffer;
    const updates = db
      .prepare(`SELECT update_ FROM ${updatesTable}`)
      .pluck()
      .all() as Buffer[];
    return [snapshot, ...updates];
  }

  createNewDb(location: string) {
    const db = new Database(location, { fileMustExist: false });
  }

  // @override
  async load(
    docId: string,
    location: string,
    doc: LoroDoc,
    createIfNotExists: boolean = false,
  ) {
    const controller = this.controllers.get(docId);
    if (controller) {
      const db = controller.db;
      const snapshotAndUpdates = this._loadSnapshotAndUpdates(db, docId);
      doc.importBatch(snapshotAndUpdates);
    } else {
      const db = this._prepareDbForDoc(docId, doc, location, createIfNotExists);
      const snapshotAndUpdates = this._loadSnapshotAndUpdates(db, docId);
      doc.importBatch(snapshotAndUpdates);
      this.controllers.set(docId, {
        docId,
        lastSavedVersion: doc.version(),
        location,
        db,
      });
    }
  }

  // @override
  async saveSnapshot(docId: string, doc: LoroDoc) {
    const controller = this.controllers.get(docId);
    if (!controller) {
      console.error(`No controller for doc ${docId}.`);
      return;
    }
    const db = controller.db;
    const snapshot = doc.export({ mode: "snapshot" });
    const snapshotBuffer = Buffer.from(snapshot);
    const snapshotTableName = getSnapshotTableName(docId);
    const updatesTableName = getUpdatesTableName(docId);
    db.prepare(`UPDATE ${snapshotTableName} SET snapshot = ?`).run(
      snapshotBuffer,
    );
    db.prepare(`DELETE FROM ${updatesTableName}`).run();
    controller.lastSavedVersion = doc.version();
  }

  // @override
  async saveNewUpdates(docId: string, doc: LoroDoc) {
    const controller = this.controllers.get(docId);
    if (!controller) {
      console.error(`No controller for doc ${docId}.`);
      return;
    }
    const db = controller.db;
    const newUpdates = doc.export({
      mode: "update",
      from: controller.lastSavedVersion,
    });
    const newUpdatesBuffer = Buffer.from(newUpdates);
    const updatesTableName = getUpdatesTableName(docId);
    db.prepare(`INSERT INTO ${updatesTableName} (update_) VALUES (?)`).run(
      newUpdatesBuffer,
    );
  }

  // @override
  async destroy() {
    for (const db of this.dbs.values()) {
      db.close();
    }
    this.dbs.clear();
    this.controllers.clear();
  }
}
