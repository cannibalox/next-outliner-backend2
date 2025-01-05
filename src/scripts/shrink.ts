import {
  BLOCK_DATA_DOC_NAME_PREFIX,
  BLOCK_INFO_DOC_NAME,
} from "../common/constants";
import { SqliteLoroDocPersister } from "../utils/helper-functions/loro/persister/impl/sqlite";
import fs from "fs";

(async () => {
  const location = "testdb/app-data22222.db";
  const beforeSize = fs.statSync(location).size;
  const persister = new SqliteLoroDocPersister();
  await persister.shrinkDoc(BLOCK_INFO_DOC_NAME, location);
  await persister.shrinkDoc(`${BLOCK_DATA_DOC_NAME_PREFIX}0`, location);
  const afterSize = fs.statSync(location).size;
  console.log(`beforeSize: ${beforeSize}, afterSize: ${afterSize}`);
})();
