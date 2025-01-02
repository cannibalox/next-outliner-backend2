import * as crypto from "crypto";

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("请输入密码：", function (password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");

  console.log("盐值：", salt);
  console.log("密码哈希：", hash);

  rl.close();
});
