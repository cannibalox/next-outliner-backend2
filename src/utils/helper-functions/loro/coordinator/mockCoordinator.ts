import { LoroDoc, LoroEventBatch } from "loro-crdt";
import { LoroCoordinator } from "./coordinator";

export class MockCoordinator implements LoroCoordinator {
  checkDoc(localDoc: LoroDoc, remoteDoc: LoroDoc): boolean {
    return true;
  }
  checkEvents(localDoc: LoroDoc, events: LoroEventBatch): boolean {
    return true;
  }
}
