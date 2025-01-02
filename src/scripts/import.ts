import { LoroDoc } from "loro-crdt";
import { LeveldbPersistence } from "y-leveldb";
import {
  BLOCK_DATA_DOC_NAME_PREFIX,
  BLOCK_DATA_MAP_NAME,
  BLOCK_INFO_DOC_NAME,
  BLOCK_INFO_MAP_NAME,
} from "../common/constants";
import { SqliteLoroDocPersister } from "../utils/helper-functions/loro/persister/impl/sqlite";

const main = async () => {
  const ldb = new LeveldbPersistence("./Notes");
  const docNames = await ldb.getAllDocNames();
  console.log(docNames);
  const yjsBaseDoc = await ldb.getYDoc("baseDoc");
  const yjsBlockDataDoc0 = await ldb.getYDoc("0");
  const yjsBlockInfoMap = yjsBaseDoc.getMap("blockInfoMap");
  const yjsBlockDataMap = yjsBlockDataDoc0.getMap("blockData");

  const loroBaseDoc = new LoroDoc();
  const loroBlockInfoMap = loroBaseDoc.getMap(BLOCK_INFO_MAP_NAME);
  const loroBlockDataDoc = new LoroDoc();
  const loroBlockDataMap = loroBlockDataDoc.getMap(BLOCK_DATA_MAP_NAME);

  for (const [k, v] of yjsBlockInfoMap.entries()) {
    if (yjsBlockDataMap.get(k)) {
      loroBlockInfoMap.set(k, v);
    }
  }

  for (const [k, v] of yjsBlockDataMap.entries()) {
    loroBlockDataMap.set(k, v);
  }

  const persister = new SqliteLoroDocPersister();
  persister.load(BLOCK_INFO_DOC_NAME, "./testdb/app-data.db", loroBaseDoc);
  persister.saveSnapshot(BLOCK_INFO_DOC_NAME, loroBaseDoc);

  persister.load(
    BLOCK_DATA_DOC_NAME_PREFIX + "0",
    "./testdb/app-data.db",
    loroBlockDataDoc,
  );
  persister.saveSnapshot(BLOCK_DATA_DOC_NAME_PREFIX + "0", loroBlockDataDoc);
};

main();
