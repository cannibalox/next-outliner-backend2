import { Service } from "./service";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";

export class LogsService extends Service {
  async getLogs(query: {
    level: string[];
    from: string;
    to: string;
    skip?: number; // 跳过的条数
    limit?: number; // 每页条数
  }) {
    const logPath = path.join(process.cwd(), "combined.log");
    const fromDate = new Date(query.from);
    const toDate = new Date(query.to);
    const levels = new Set(query.level);

    const skip = query.skip || 0;
    const limit = query.limit || 100; // 默认每页100条

    const logEntries: any[] = [];
    let matchedCount = 0; // 匹配条件的记录计数
    let skippedCount = 0; // 已跳过的记录计数

    const fileStream = fs.createReadStream(logPath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      try {
        const logEntry = JSON.parse(line);
        const logDate = new Date(logEntry.timestamp);

        // 检查日期范围和日志级别
        if (
          logDate >= fromDate &&
          logDate <= toDate &&
          levels.has(logEntry.level)
        ) {
          matchedCount++;

          // 跳过前 skip 条记录
          if (skippedCount < skip) {
            skippedCount++;
            continue;
          }

          // 收集 limit 条记录
          logEntries.push(logEntry);

          // 达到限制数量后结束读取
          if (logEntries.length >= limit) {
            break;
          }
        }
      } catch (err) {
        console.error("解析日志行时出错:", err);
        continue;
      }
    }

    // 关闭文件流
    fileStream.destroy();

    return {
      data: logEntries,
      pagination: {
        total: matchedCount, // 符合条件的总记录数
        skip: skip, // 跳过的记录数
        limit: limit, // 每页限制
        hasMore: matchedCount > skip + limit, // 是否还有更多数据
      },
    };
  }
}
