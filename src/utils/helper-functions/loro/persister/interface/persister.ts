import { LoroDoc } from "loro-crdt";

export type LoroDocPersister = {
  ensureDoc: (
    docId: string,
    location: string,
    snapshot?: Uint8Array,
    updates?: Uint8Array[],
  ) => Promise<void>;
  getAllDocIds: (location: string) => Promise<string[]>;
  docExists: (docId: string, location: string) => Promise<boolean>;
  deleteDoc: (docId: string, location: string) => Promise<void>;
  loadSnapshot: (docId: string, location: string) => Promise<Uint8Array>;
  loadUpdates: (docId: string, location: string) => Promise<Uint8Array[]>;
  loadBatch: (docId: string, location: string, doc: LoroDoc) => Promise<void>;
  saveSnapshot: (
    docId: string,
    location: string,
    snapshot: Uint8Array,
  ) => Promise<void>;
  shrinkDoc: (docId: string, location: string) => Promise<void>;
  saveUpdates: (
    docId: string,
    location: string,
    updates: Uint8Array[],
  ) => Promise<void>;
  destroy?: () => Promise<void>;
};
