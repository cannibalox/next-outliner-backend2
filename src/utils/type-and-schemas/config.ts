import { z } from "zod";

export const ConfigSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().default(8081),
  https: z
    .object({
      key: z.string(),
      cert: z.string(),
    })
    .optional(),
  jwtSecret: z.string(),
  logger: z.boolean().default(true),
  maxParamLength: z.number().default(500),
  knowledgeBases: z.string().array().min(1),
  newKnowledgeBasePathPrefix: z.string(),
  adminPasswordHash: z.string(),
  adminSalt: z.string(),
});

export type Config = z.infer<typeof ConfigSchema>;
