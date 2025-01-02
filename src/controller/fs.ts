import { z } from "zod";
import { RESP_CODES } from "../common/constants";
import {
  FsEnsureAttachmentsDirSchema,
  FsGetAttachmentSignedUrlSchema,
  FsLsSchema,
  FsStatSchema,
} from "../common/type-and-schemas/api/fs";
import { ConfigService } from "../service/config";
import { BusinessError } from "../utils/helper-functions/error";
import { isFile, ls } from "../utils/helper-functions/fs";
import {
  Controller,
  ControllerInitContext,
  RegisterHandlerParams,
} from "./controller";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import crypto from "crypto";
import mime from "mime";
import { logger } from "../utils/logger";

const ATTACHMENT_FOLDER = "attachments";
const iv = crypto.randomBytes(16);

// Helper function to ensure the secret key is 32 bytes long
function ensureKeyLength(key: string): Buffer {
  return Buffer.from(key.padEnd(32, "0").slice(0, 32));
}

export class FsController extends Controller {
  private _configService: ConfigService | null = null;

  init(context: ControllerInitContext): void {
    this._configService = context.getService(ConfigService);
  }

  registerHandlers({ fastify, onPost }: RegisterHandlerParams): void {
    onPost(
      "/fs/ls",
      "列出目录下的所有内容（包括文件 & 子目录）",
      FsLsSchema.request,
      FsLsSchema.result,
      ["admin", "kb-editor"],
      ({ basePath, includeHidden, recursive, maxDepth }, req) => {
        const { location } = req;
        if (!location)
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无法访问该路径",
          );
        const absPath = path.join(location, ATTACHMENT_FOLDER, basePath);
        const result = ls(absPath, { includeHidden, recursive, maxDepth });
        return result;
      },
    );

    onPost(
      "/fs/stat",
      "获取文件或目录的详细信息",
      FsStatSchema.request,
      FsStatSchema.result,
      ["admin", "kb-editor"],
      ({ path: relativePath }, req) => {
        const { location } = req;
        if (!location)
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无法访问该路径",
          );
        const absPath = path.join(location, ATTACHMENT_FOLDER, relativePath);
        if (!fs.existsSync(absPath))
          throw new BusinessError(RESP_CODES.PATH_NOT_FOUND, "路径不存在");
        const result = fs.statSync(absPath);
        return {
          ctime: result.ctime,
          mtime: result.mtime,
          size: result.size,
        };
      },
    );

    onPost(
      `/fs/upload`,
      "上传文件",
      z.any(),
      z.any(),
      ["admin", "kb-editor"],
      async ({ overwrite, mkdir }, req) => {
        const { location } = req;
        if (!location)
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无法访问该路径",
          );
        let targetPath: string | null = null;
        let needOverwrite = false;
        let needMkdir = false;
        for await (const part of req.parts()) {
          // 现在期望收到一个路径
          if (targetPath == null) {
            //  并且真的收到了一个 string field，将其作为路径
            if (part.type == "field" && typeof part.value == "string") {
              const relativePath = part.value;
              targetPath = path.join(location, ATTACHMENT_FOLDER, relativePath);
              if (fs.existsSync(targetPath)) {
                if (!overwrite)
                  throw new BusinessError(
                    RESP_CODES.FILE_EXISTS,
                    "同一目录下已经存在同名文件",
                  );
                needOverwrite = true;
              }
              const dir = path.dirname(targetPath);
              if (!fs.existsSync(dir)) {
                if (!mkdir)
                  throw new BusinessError(
                    RESP_CODES.DIR_NOT_FOUND,
                    "目标路径不存在",
                  );
                needMkdir = true;
              }
            }
          }
          // 现在期望收到一个文件或字符串
          else {
            await new Promise((resolve, reject) => {
              if (!targetPath)
                throw new BusinessError(
                  RESP_CODES.INVALID_REQUEST,
                  "目标路径不存在",
                );
              const ws = fs.createWriteStream(targetPath);
              if (needOverwrite) fs.rmSync(targetPath);
              if (needMkdir)
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
              // 将文件存到目标位置
              if (part.type === "file") {
                part.file.pipe(ws);
                part.file.on("end", resolve);
                part.file.on("error", reject);
              }
              // 将字符串写到目标位置
              else if (part.type === "field" && typeof part.value == "string") {
                ws.write(part.value, (err) => {
                  if (err) reject(err);
                  else resolve(undefined);
                });
              }
            });
          }
        }
      },
    );

    onPost(
      "/fs/ensure-attachments-dir",
      "确保附件目录存在",
      FsEnsureAttachmentsDirSchema.request,
      FsEnsureAttachmentsDirSchema.result,
      ["admin", "kb-editor"],
      ({}, req) => {
        const { location } = req;
        if (!location)
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无法访问该路径",
          );
        const attachmentsDir = path.join(location, ATTACHMENT_FOLDER);
        if (!fs.existsSync(attachmentsDir))
          fs.mkdirSync(attachmentsDir, { recursive: true });
        return {};
      },
    );

    onPost(
      "/fs/get-attachment-signed-url",
      "获取附件的临时下载链接",
      FsGetAttachmentSignedUrlSchema.request,
      FsGetAttachmentSignedUrlSchema.result,
      ["admin", "kb-editor"],
      async ({ path: relativePath, attachment, inferMimeType }, req) => {
        const { location } = req;
        if (!location)
          throw new BusinessError(
            RESP_CODES.NO_AUTHORIZATION,
            "无法访问该路径",
          );
        const config = this._configService!.getConfig();
        const targetPath = path.join(location, ATTACHMENT_FOLDER, relativePath);
        const exists = await isFile(targetPath);
        if (!exists)
          throw new BusinessError(RESP_CODES.TARGET_NOT_FOUND, "文件不存在");
        // 生成一个临时下载链接
        const expires = dayjs().add(1, "hour").toISOString(); // 1小时后过期
        const signature = crypto
          .createHmac("sha256", config.jwtSecret)
          .update(`${targetPath}:${expires}`)
          .digest("hex");
        const queryParams = {
          file: targetPath,
          expires,
          signature,
          attachment,
          inferMimeType,
        };

        // Encrypt the query parameters
        const cipher = crypto.createCipheriv(
          "aes-256-cbc",
          ensureKeyLength(config.jwtSecret),
          iv,
        );
        let encrypted = cipher.update(
          JSON.stringify(queryParams),
          "utf8",
          "hex",
        );
        encrypted += cipher.final("hex");

        const encryptedQueryParams = encodeURIComponent(encrypted);
        const signedUrl = `/fs/download-attachment?q=${encryptedQueryParams}`;
        return { signedUrl };
      },
    );

    // TODO: use onGet instead of access fastify directly
    fastify.get("/fs/download-attachment", (req, reply) => {
      const config = this._configService!.getConfig();
      try {
        // 解密请求参数
        const encryptedQueryParams = (req.query as any)?.["q"];
        if (!encryptedQueryParams) {
          reply
            .status(200)
            .send({ success: false, code: RESP_CODES.INVALID_REQUEST });
          return;
        }

        // Decrypt the query parameters
        const decipher = crypto.createDecipheriv(
          "aes-256-cbc",
          ensureKeyLength(config.jwtSecret),
          iv,
        );
        let decryptedQueryParams = decipher.update(
          decodeURIComponent(encryptedQueryParams),
          "hex",
          "utf8",
        );
        decryptedQueryParams += decipher.final("utf8");

        // 验证请求参数
        const querySchema = z
          .string()
          .transform((value) => {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          })
          .pipe(
            z.object({
              file: z.string(),
              expires: z.string(),
              signature: z.string(),
              // 是否按附件形式下载
              attachment: z.coerce.boolean().optional(),
              // 是否自动推断 MIME 类型
              inferMimeType: z.coerce.boolean().optional(),
            }),
          );

        const query = querySchema.safeParse(decryptedQueryParams);
        if (!query.success) {
          reply
            .status(200)
            .send({ success: false, code: RESP_CODES.INVALID_REQUEST });
          return;
        }
        console.log(
          `[DOWNLOAD_ATTACHMENT] query=${JSON.stringify(query.data)}`,
        );

        const {
          file: targetPath,
          expires,
          signature,
          attachment,
          inferMimeType,
        } = query.data;
        // 验证签名
        const expectedSignature = crypto
          .createHmac("sha256", config.jwtSecret)
          .update(`${targetPath}:${expires}`)
          .digest("hex");
        if (signature !== expectedSignature) {
          reply
            .status(200)
            .send({ success: false, code: RESP_CODES.INVALID_REQUEST });
          return;
        }
        // 验证过期时间
        const expiresDate = dayjs(expires);
        if (dayjs().isAfter(expiresDate)) {
          reply
            .status(200)
            .send({ success: false, code: RESP_CODES.TOKEN_EXPIRED });
          return;
        }
        // 获得要发送的文件
        const exists = fs.existsSync(targetPath);
        if (!exists) {
          reply
            .status(200)
            .send({ success: false, code: RESP_CODES.TARGET_NOT_FOUND });
          return;
        }
        // MIME 类型
        const mimeType = inferMimeType
          ? mime.getType(targetPath) ?? "application/octet-stream"
          : "application/octet-stream";
        const stat = fs.statSync(targetPath);
        const fileSize = stat.size;
        const { range } = req.headers;
        // 处理 range 请求（断点续传）
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          const stream = fs.createReadStream(targetPath, { start, end });
          return reply
            .code(206)
            .headers({
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunkSize,
              "Content-Type": mimeType,
              "Content-Disposition": `${attachment ? "attachment; " : ""}filename="${path.basename(targetPath)}"`,
            })
            .send(stream);
        }
        // 处理普通请求
        else {
          const stream = fs.createReadStream(targetPath);
          return reply
            .headers({
              "Content-Length": fileSize,
              "Content-Type": mimeType,
              "Content-Disposition": `${attachment ? "attachment; " : ""}filename="${path.basename(targetPath)}"`,
            })
            .send(stream);
        }
      } catch (err) {
        console.error(err);
        reply
          .status(200)
          .send({ success: false, code: RESP_CODES.UNKNOWN_ERROR });
      }
    });
  }
}
