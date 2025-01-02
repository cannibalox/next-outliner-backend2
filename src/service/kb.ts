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
      logger.error(`Kb location ${location} must start with ${prefix}`);
      return;
    }
    // 检查路径是否已存在
    if (fs.existsSync(location)) {
      logger.error(`Kb location ${location} already exists`);
      return;
    }
    // 可以创建新的知识库！
    // 先生成密码哈希
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha512")
      .toString("hex");
    // 创建知识库目录，并写入配置文件
    fs.mkdirSync(location, { recursive: true });
    const configFilePath = path.join(location, "config.yml");
    const configFileContent = YAML.stringify({
      name,
      passwordHash,
      salt,
    });
    fs.writeFileSync(configFilePath, configFileContent);
    // 创建空数据库
    const persister = new SqliteLoroDocPersister();
    const date = dayjs().format("YYYYMMDDHHmmss");
    const dbLocation = path.join(location, `db_${date}.sqlite`);
    persister.createNewDb(dbLocation);
    // 注册到配置文件中
    const config = this._configService!.getConfig();
    this._configService!.setConfig("knowledgeBases", [
      ...config.knowledgeBases,
      location,
    ]);
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
}
