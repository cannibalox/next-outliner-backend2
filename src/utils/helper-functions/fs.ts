import { PathLike } from "node:fs";
import * as fs from "fs";
import path from "node:path";
import { BusinessError } from "./error";
import { RESP_CODES as ERR_CODES } from "../../common/constants";
import { Dirents } from "../../common/type-and-schemas/dirents";

/**
 * 检查指定目录是否为空
 * @param dir - 要检查的目录路径
 * @returns 如果目录为空返回true,否则返回false
 */
export const isDirEmpty = (dir: PathLike) => {
  try {
    // 尝试读取目录内容
    const files = fs.readdirSync(dir);
    // 如果文件数量为0,则目录为空
    return files.length == 0;
  } catch (err) {
    // 如果读取目录时发生错误(例如目录不存在),返回false
    return false;
  }
};

// 判断路径是否是文件
export const isFile = (filePath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        resolve(false);
      } else {
        resolve(stats.isFile());
      }
    });
  });
};

/**
 * 判断一个路径是否为另一个路径的子目录
 * @param child - 可能的子目录路径
 * @param parent - 可能的父目录路径
 * @returns 如果child是parent的子目录则返回true,否则返回false
 */
export const isChildOf = (child: string, parent: string) => {
  // 如果两个路径相同,则不是子目录关系
  if (child === parent) return false;

  // 将路径分割成token,并过滤掉空字符串
  let parentTokens = parent.split("/").filter((i) => i.length);
  let childTokens = child.split("/").filter((i) => i.length);

  // 检查父路径的每个token是否与子路径的对应部分匹配
  return parentTokens.every((t, i) => childTokens[i] === t);
};

export const ls = (
  basePath: string,
  options: {
    includeHidden?: boolean;
    recursive?: boolean;
    maxDepth?: number;
  },
) => {
  const recur = (baseDir: string, level: number) => {
    const result: Dirents = {};
    const dirents = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const dirent of dirents) {
      const { name } = dirent;
      if (!options.includeHidden && name.startsWith(".")) continue;
      if (
        dirent.isDirectory() &&
        options.recursive &&
        level < (options.maxDepth ?? Infinity)
      ) {
        const subDirents = recur(path.join(baseDir, name), level + 1);
        const stats = fs.statSync(path.join(baseDir, name));
        result[name] = {
          isDirectory: true,
          name,
          ctime: stats.ctime,
          mtime: stats.mtime,
          size: stats.size,
          subDirents,
        };
      } else {
        const stats = fs.statSync(path.join(baseDir, name));
        result[name] = {
          isDirectory: false,
          name,
          ctime: stats.ctime,
          mtime: stats.mtime,
          size: stats.size,
        };
      }
    }
    return result;
  };

  if (!fs.existsSync(basePath)) {
    throw new BusinessError(ERR_CODES.PATH_NOT_FOUND, "路径不存在");
  }

  return recur(basePath, 0);
};
