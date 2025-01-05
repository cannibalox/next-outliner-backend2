import { LoroDoc } from "loro-crdt";
import { SqliteLoroDocPersister } from "../utils/helper-functions/loro/persister/impl/sqlite";
import {
  BLOCK_DATA_DOC_NAME_PREFIX,
  BLOCK_INFO_DOC_NAME,
  DATA_MAP_NAME,
} from "../common/constants";

const main = async () => {
  const persister = new SqliteLoroDocPersister();

  const blockInfoDoc = new LoroDoc();
  const blockDataDoc0 = new LoroDoc();
  await persister.loadBatch(
    BLOCK_INFO_DOC_NAME,
    "testdb/app-data.db",
    blockInfoDoc,
  );
  await persister.loadBatch(
    `${BLOCK_DATA_DOC_NAME_PREFIX}0`,
    "testdb/app-data.db",
    blockDataDoc0,
  );

  const blockInfoMap = blockInfoDoc.getMap(DATA_MAP_NAME);
  const blockDataMap0 = blockDataDoc0.getMap(DATA_MAP_NAME);

  const blockInfoDocSnapshot = blockInfoDoc.export({ mode: "snapshot" });
  const blockDataDoc0Snapshot = blockDataDoc0.export({ mode: "snapshot" });

  console.log(
    (blockInfoDocSnapshot.byteLength + blockDataDoc0Snapshot.byteLength) /
      1024 /
      1024,
  );

  const location = "test-db.db";
  await persister.ensureDoc(
    BLOCK_INFO_DOC_NAME,
    location,
    blockInfoDocSnapshot,
  );
  await persister.ensureDoc(
    `${BLOCK_DATA_DOC_NAME_PREFIX}0`,
    location,
    blockDataDoc0Snapshot,
  );
};

main();
