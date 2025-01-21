import { parseDocument } from "yaml";
import { ConfigService } from "./config";
import { Service, ServiceInitContext } from "./service";
import { logger } from "../utils/logger";
import path from "path";
import fs from "fs";
import { KnowledgeBaseInfoSchema } from "../utils/type-and-schemas/kb-info";
import crypto from "crypto";
import YAML from "yaml";
import { SqliteLoroDocPersister } from "../utils/helper-functions/loro/persister/impl/sqlite";
import dayjs from "dayjs";
import { BLOCK_INFO_DOC_NAME, RESP_CODES } from "../common/constants";
import { BusinessError } from "../utils/helper-functions/error";

export const KB_DB_NAME = "app-data.db";
export const BACKUP_FOLDER_NAME = "backups";

export class KbService extends Service {
  private _configService: ConfigService | null = null;
  private _kbConfigDocs: Map<string, ReturnType<typeof parseDocument>> =
    new Map();

  init(context: ServiceInitContext) {
    this._configService = context.getService(ConfigService);
  }

  getKbInfo(kbLocation: string) {
    if (this._kbConfigDocs.has(kbLocation))
      return this._kbConfigDocs.get(kbLocation)?.toJS();
    const existedKbs = this._configService!.getConfig().knowledgeBases;
    if (!existedKbs.includes(kbLocation)) {
      logger.error(`Knowledge base ${kbLocation} does not exist`);
      return null;
    }
    // 对每个知识库，其路径根目录下的 config.yml 文件为其配置文件
    // 存储了其名称、密码哈希、盐等数据
    const kbConfigPath = path.join(kbLocation, "config.yml");
    if (!fs.existsSync(kbConfigPath)) {
      logger.error(`Knowledge base config file not found at ${kbConfigPath}`);
      return null;
    }
    const kbConfigText = fs.readFileSync(kbConfigPath, "utf8");
    const kbConfigDoc = parseDocument(kbConfigText);
    // 检查配置文件格式是否正确
    const validationResult = KnowledgeBaseInfoSchema.safeParse(
      kbConfigDoc.toJS(),
    );
    if (!validationResult.success) return null;
    this._kbConfigDocs.set(kbLocation, kbConfigDoc);
    return validationResult.data;
  }

  createNewKb(location: string, name: string, password: string) {
    // 检查路径是否符合要求
    const prefix = this._configService!.getConfig().newKnowledgeBasePathPrefix;
    if (!location.startsWith(prefix)) {
      throw new BusinessError(
        RESP_CODES.PATH_CANNOT_ACCESS,
        `知识库路径必须是 ${prefix} 的子路径`,
      );
    }
    // 检查路径是否已存在
    if (fs.existsSync(location)) {
      if (fs.readdirSync(location).length > 0) {
        throw new BusinessError(
          RESP_CODES.PATH_EXISTS_AND_NOT_EMPTY,
          `路径 ${location} 已存在，且不为空`,
        );
      }
    } else {
      // 只在路径不存在时创建目录
      fs.mkdirSync(location, { recursive: true });
    }

    // 生成密码哈希
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha512")
      .toString("hex");

    // 写入配置文件
    const configFilePath = path.join(location, "config.yml");
    const configFileContent = YAML.stringify({
      name,
      passwordHash,
      salt,
    });
    fs.writeFileSync(configFilePath, configFileContent);

    // 创建数据库
    try {
      const persister = new SqliteLoroDocPersister();
      const dbLocation = path.join(location, KB_DB_NAME);
      persister.ensureDoc(BLOCK_INFO_DOC_NAME, dbLocation);
    } catch (error) {
      // 如果数据库创建失败，清理已创建的目录
      fs.rmSync(location, { recursive: true, force: true });
      throw new BusinessError(
        RESP_CODES.UNKNOWN_ERROR,
        `知识库数据库文件创建失败`,
      );
    }

    // 注册到配置文件中
    const config = this._configService!.getConfig();
    this._configService!.setConfig("knowledgeBases", [
      ...config.knowledgeBases,
      location,
    ]);
  }

  deleteKb(location: string) {
    const config = this._configService!.getConfig();
    if (!config.knowledgeBases.includes(location)) {
      throw new BusinessError(
        RESP_CODES.TARGET_NOT_FOUND,
        `要删除的知识库 ${location} 不存在`,
      );
    }
    const newKnowledgeBases = config.knowledgeBases.filter(
      (kb) => kb !== location,
    );
    this._configService!.setConfig("knowledgeBases", newKnowledgeBases);
    fs.rmSync(location, { recursive: true, force: true });
  }

  getAllKbBaseInfo() {
    const config = this._configService!.getConfig();
    const ret = [];
    for (const location of config.knowledgeBases) {
      const info = this.getKbInfo(location);
      if (info) ret.push({ name: info.name, location });
    }
    return ret;
  }

  backupKb(location: string) {
    const config = this._configService!.getConfig();
    if (!config.knowledgeBases.includes(location)) {
      throw new BusinessError(
        RESP_CODES.TARGET_NOT_FOUND,
        `要备份的知识库 ${location} 不存在`,
      );
    }
    const dbFilePath = path.join(location, KB_DB_NAME);
    if (!fs.existsSync(dbFilePath)) {
      throw new BusinessError(
        RESP_CODES.TARGET_NOT_FOUND,
        `要备份的知识库 ${location} 数据库文件不存在`,
      );
    }
    const backupFolderPath = path.join(location, BACKUP_FOLDER_NAME);
    if (!fs.existsSync(backupFolderPath))
      fs.mkdirSync(backupFolderPath, { recursive: true });
    const backupPath = path.join(
      backupFolderPath,
      `backup-${dayjs().format("YYYYMMDDHHmmss")}.db`,
    );
    fs.copyFileSync(dbFilePath, backupPath);
    return backupPath;
  }

  listAllBackups(location: string) {
    const backupFolderPath = path.join(location, BACKUP_FOLDER_NAME);
    if (!fs.existsSync(backupFolderPath)) return [];
    return fs.readdirSync(backupFolderPath).map((fileName) => {
      const filePath = path.join(backupFolderPath, fileName);
      const stats = fs.statSync(filePath);
      return {
        name: fileName,
        size: stats.size,
      };
    });
  }

  shrinkKb(location: string) {
    throw new Error("Not implemented");
  }
}
