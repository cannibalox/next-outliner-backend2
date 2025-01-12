import { RESP_CODES } from "../common/constants";
import {
  BackupKbSchema,
  DeleteKbSchema,
  ListAllBackupsSchema,
} from "../common/type-and-schemas/api/kb";
import {
  CreateKbSchema,
  GetAllKbInfoSchema,
  RenameKbSchema,
} from "../common/type-and-schemas/api/kb";
import { KbService } from "../service/kb";
import { BusinessError } from "../utils/helper-functions/error";
import {
  Controller,
  ControllerInitContext,
  RegisterHandlerParams,
} from "./controller";

export class KbController extends Controller {
  private _kbService: KbService | null = null;

  init(context: ControllerInitContext): void {
    this._kbService = context.getService(KbService);
  }

  registerHandlers({ onPost }: RegisterHandlerParams): void {
    onPost(
      "/kb/list",
      "获取知识库列表",
      GetAllKbInfoSchema.request,
      GetAllKbInfoSchema.result,
      ["admin", "kb-editor", "visitor"],
      () => this._kbService!.getAllKbBaseInfo(),
    );

    onPost(
      "/kb/create",
      "创建知识库",
      CreateKbSchema.request,
      CreateKbSchema.result,
      ["admin"],
      ({ location, name, password }) => {
        this._kbService!.createNewKb(location, name, password);
        return {};
      },
    );

    onPost(
      "/kb/rename",
      "重命名知识库",
      RenameKbSchema.request,
      RenameKbSchema.result,
      ["admin"],
      async ({ location, newName }) => {
        const kbInfo = this._kbService!.getKbInfo(location);
        if (!kbInfo)
          throw new BusinessError(
            RESP_CODES.TARGET_NOT_FOUND,
            `知识库 ${location} 不存在`,
          );
        // TODO
        throw new Error("Not implemented");
      },
    );

    onPost(
      "/kb/delete",
      "删除知识库",
      DeleteKbSchema.request,
      DeleteKbSchema.result,
      ["admin", "kb-editor"],
      ({ location }, req) => {
        if (req.role === "kb-editor" && req.location !== location) {
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无权限删除其他知识库",
          );
        }
        this._kbService!.deleteKb(location);
        return {};
      },
    );

    onPost(
      "/kb/backup",
      "备份知识库",
      BackupKbSchema.request,
      BackupKbSchema.result,
      ["admin", "kb-editor"],
      ({ location }, req) => {
        if (req.role === "kb-editor" && req.location !== location) {
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无权限备份此知识库",
          );
        }
        const backupPath = this._kbService!.backupKb(location);
        return { backupPath };
      },
    );

    onPost(
      "/kb/listAllBackups",
      "获取知识库备份列表",
      ListAllBackupsSchema.request,
      ListAllBackupsSchema.result,
      ["admin", "kb-editor"],
      ({ location }, req) => {
        if (req.role === "kb-editor" && req.location !== location) {
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无权限查看此知识库的备份",
          );
        }
        return this._kbService!.listAllBackups(location);
      },
    );
  }
}
