import { LoroDoc } from "loro-crdt";

export type LoroDocPersister = {
  // Load the doc from the persister
  load: (docId: string, location: string, doc: LoroDoc) => Promise<void>;
  // Save a snapshot for a doc
  // This will delete all the saved updates of this doc
  saveSnapshot: (docId: string, doc: LoroDoc) => Promise<void>;
  // Save updates since last save for a doc
  saveNewUpdates: (docId: string, doc: LoroDoc) => Promise<void>;
  // Destroy the persister
  destroy?: () => Promise<void>;
};
