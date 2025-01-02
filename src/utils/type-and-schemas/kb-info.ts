import { z } from "zod";

export const KnowledgeBaseInfoSchema = z.object({
  name: z.string(),
  passwordHash: z.string(),
  salt: z.string(),
});

export type KnowledgeBaseInfo = z.infer<typeof KnowledgeBaseInfoSchema>;
