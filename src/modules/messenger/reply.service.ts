import fs from "fs/promises";
import path from "path";
import { config } from "../../config/env.js";
import { logger } from "../../infra/logger.js";
import { generateContent } from "../../ai/client.js";
import { errorMessage } from "../../infra/errors.js";
import { buildMessengerReplyPrompt } from "../../ai/prompts/reply.prompt.js";
import { getRelevantKnowledge } from "../knowledge/knowledge.store.js";

const KNOWLEDGE_BASE_FILE = path.join(process.cwd(), "knowledge-base.json");

let cachedKnowledgeBase: any = null;

async function loadKnowledgeBase(): Promise<any> {
  if (cachedKnowledgeBase) {
    return cachedKnowledgeBase;
  }

  const data = await fs.readFile(KNOWLEDGE_BASE_FILE, "utf-8");
  cachedKnowledgeBase = JSON.parse(data);
  return cachedKnowledgeBase;
}

export async function generateMessengerReply(
  userMessage: string,
  conversationContext: any = []
): Promise<string> {
  try {
    const [knowledgeBase, relevantKnowledge] = await Promise.all([
      loadKnowledgeBase(),
      getRelevantKnowledge(userMessage),
    ]);
    const recentMessages = Array.isArray(conversationContext)
      ? conversationContext
      : conversationContext.recentMessages || [];
    const relevantMemories = Array.isArray(conversationContext)
      ? []
      : conversationContext.relevantMemories || [];

    const prompt = buildMessengerReplyPrompt(
      userMessage,
      relevantKnowledge,
      relevantMemories,
      recentMessages
    );
    const reply = await generateContent(config.model, prompt);

    return reply || knowledgeBase.fallback_reply;
  } catch (error) {
    logger.error("Messenger reply generation failed:", { error: errorMessage(error) });
    return "ধন্যবাদ মেসেজ করার জন্য। আপনার প্রয়োজনটা একটু বিস্তারিত বললে আমি বুঝে বলতে পারব কীভাবে সাহায্য করা যায়।";
  }
}
