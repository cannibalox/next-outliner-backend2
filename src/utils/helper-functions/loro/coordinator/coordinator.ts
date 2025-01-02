import { LoroDoc, LoroEventBatch } from "loro-crdt";

export type LoroCoordinator = {
  checkDoc: (localDoc: LoroDoc, remoteDoc: LoroDoc) => boolean;
  // check all the changes in the oplog and see if there are any conflicts
  checkEvents: (localDoc: LoroDoc, events: LoroEventBatch) => boolean;
};
