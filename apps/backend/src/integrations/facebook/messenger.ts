import { logger } from "../../infra/logger.js";
import { errorMessage } from "../../infra/errors.js";
import { graphPost } from "./graph-client.js";

export async function sendMessengerReply(recipientId: string, text: string) {
  try {
    const response = await graphPost("me/messages", {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text },
    });

    logger.info("Messenger reply sent:", { data: response.data });
    return response.data;
  } catch (error) {
    logger.error("Failed to send Messenger reply.", { error: errorMessage(error) });
    return null;
  }
}
