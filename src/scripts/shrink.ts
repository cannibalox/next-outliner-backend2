import {
  BLOCK_DATA_DOC_NAME_PREFIX,
  BLOCK_INFO_DOC_NAME,
} from "../common/constants";
import { SqliteLoroDocPersister } from "../utils/helper-functions/loro/persister/impl/sqlite";

(async () => {
  const persister = new SqliteLoroDocPersister();
  await persister.shrinkDoc(BLOCK_INFO_DOC_NAME, "testdb/app-data.db");
  await persister.shrinkDoc(
    `${BLOCK_DATA_DOC_NAME_PREFIX}0`,
    "testdb/app-data.db",
  );
})();
