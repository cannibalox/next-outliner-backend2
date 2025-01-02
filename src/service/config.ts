import { readFileSync, writeFileSync } from "fs";
import { Service } from "./service";
import { DEFAULT_CONFIG_PATH } from "../utils/constants";
import { parseDocument } from "yaml";
import { logger } from "../utils/logger";
import { z } from "zod";
import { ConfigSchema, Config } from "../utils/type-and-schemas/config";

export class ConfigService extends Service {
  private _configDoc: ReturnType<typeof parseDocument> | null = null;

  private _loadConfig() {
    // 读取配置文件
    const text = readFileSync(DEFAULT_CONFIG_PATH, "utf8");
    this._configDoc = parseDocument(text);
    // 验证配置文件
    const validationResult = ConfigSchema.safeParse(this._configDoc.toJS());
    if (!validationResult.success) {
      logger.error(`Invalid config file: ${validationResult.error.message}`);
      process.exit(1);
    }
  }

  getConfig() {
    if (!this._configDoc) this._loadConfig();
    return (this._configDoc?.toJS() ?? {}) as z.infer<typeof ConfigSchema>;
  }

  setConfig(key: keyof Config, value: Config[keyof Config]) {
    if (!this._configDoc) this._loadConfig();
    if (!this._configDoc) {
      logger.error("Config file not found");
      process.exit(1);
      1;
    }
    // 先验证这一修改是否有效
    const config = this._configDoc.toJS();
    config[key] = value;
    const validationResult = ConfigSchema.safeParse(config);
    if (!validationResult.success) {
      logger.error(`Invalid config file: ${validationResult.error.message}`);
      process.exit(1);
    }
    // 修改配置文件，并保存
    this._configDoc.set(key, value);
    const text = this._configDoc.toString();
    writeFileSync(DEFAULT_CONFIG_PATH, text);
  }
}
