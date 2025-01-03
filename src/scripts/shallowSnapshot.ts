import { LoroDoc } from "loro-crdt";

const doc1 = new LoroDoc();
const list = doc1.getList("list");
for (let i = 0; i < 1000000; i++) {
  list.insert(i, i);
}
const snapshot = doc1.export({
  mode: "shallow-snapshot",
  frontiers: doc1.frontiers(),
});
console.log(list.length);

const doc2 = new LoroDoc();
doc2.importBatch([snapshot]);
const updates = doc2.export({ mode: "update" });

const doc3 = new LoroDoc();
doc3.importBatch([updates]);
console.log(doc3.getList("list").length);
