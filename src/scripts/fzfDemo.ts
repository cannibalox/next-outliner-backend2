// import fs from "fs";
// import { Document, Index } from "flexsearch";
// import crypto from "crypto";

// const dpcq = fs.readFileSync("./src/scripts/斗破苍穹.txt", "utf-8");
// const lines: { id: string; ctext: string }[] = dpcq.split("\n").map((line) => ({
//   id: crypto.randomUUID(),
//   ctext: line.trim(),
// }));
// const fzf = new Index({
//   encode: (str) => str.replace(/[\x00-\x7F]/g, "").split(""),
// });
// console.log(lines.length);

// for (const line of lines) {
//   fzf.add(line.id, line.ctext);
// }

// const queries = [
//   "萧炎",
//   "薰儿",
//   "云韵",
//   "云岚宗",
//   "炼药师",
//   "斗帝",
//   "斗气大陆",
//   "迦南学院",
//   "焚决",
//   "丹药",
// ];

// console.log("By FlexSearch: ");
// for (const query of queries) {
//   const result = fzf.search(query, { limit: 100000, enrich: true });
//   console.log(query, result[0]);
// }
