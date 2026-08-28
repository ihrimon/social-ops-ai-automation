import { v2 as cloudinary } from "cloudinary";
import { aiConfig, cloudinaryConfig } from "../../config/env.js";
import { logger } from "../../infra/logger.js";

const HORDE_API_BASE = aiConfig.hordeApiBase;
const ANON_API_KEY = aiConfig.aiHordeApiKey;

cloudinary.config({
  cloud_name: cloudinaryConfig.cloudName,
  api_key: cloudinaryConfig.apiKey,
  api_secret: cloudinaryConfig.apiSecret,
});

// AI Horde dynamically lowers resolution limits during heavy demand.
// 512x512 is the base SD resolution and always accepted by the anon key.
const SAFE_WIDTH = 512;
const SAFE_HEIGHT = 512;
const SAFE_STEPS = 20;

export async function generateImage(data: { inputs?: string }): Promise<string | null> {
  try {
    const prompt = data.inputs || "beautiful scenery";

    // Step 1: Submit generation job
    const submitResponse = await fetch(`${HORDE_API_BASE}/generate/async`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_API_KEY as string,
      },
      body: JSON.stringify({
        prompt: prompt,
        models: ["stable_diffusion"], // anon key works reliably with SD
        params: {
          width: SAFE_WIDTH, // 512 — safe under any anon limit
          height: SAFE_HEIGHT, // 512 — safe under any anon limit
          steps: SAFE_STEPS, // 20 — well under 50 step limit
          cfg_scale: 7.5,
          sampler_name: "k_euler_a", // no step penalty with this sampler
          n: 1,
        },
      }),
    });

    if (!submitResponse.ok) {
      const err = await submitResponse.text();
      throw new Error(`Horde submit failed: HTTP ${submitResponse.status} - ${err}`);
    }

    const submitResult: any = await submitResponse.json();
    const jobId = submitResult.id || submitResult._id;

    if (!jobId) {
      throw new Error("No job ID returned from Horde");
    }

    logger.info(`Job submitted: ${jobId}. Waiting...`);

    // Step 2: Poll status (max ~10 min, 5s interval)
    let imageUrl: string | null = null;
    let attempts = 0;
    const maxAttempts = 120;
    const pollInterval = 5000; // 5 seconds

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(`${HORDE_API_BASE}/generate/status/${jobId}`, {
        headers: { apikey: ANON_API_KEY as string },
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: HTTP ${statusResponse.status}`);
      }

      const statusResult: any = await statusResponse.json();

      if (statusResult.done) {
        if (statusResult.generations && statusResult.generations.length > 0) {
          imageUrl = statusResult.generations[0].img; // correct field is "img", not "url"
        }
        break;
      }

      if (statusResult.faulted || statusResult.cancelled) {
        throw new Error(`Job failed: ${statusResult.state || "unknown error"}`);
      }

      attempts++;
      logger.info(
        `Polling... attempt ${attempts}/${maxAttempts} - done: ${statusResult.done}, queue: ${statusResult.queue_position ?? "?"}`
      );
    }

    if (!imageUrl) {
      throw new Error("Timeout: Image generation took too long or failed");
    }

    logger.info(`Generated image URL: ${imageUrl}`);

    // Step 3: Upload to Cloudinary for a stable permanent URL
    try {
      const uploadResult = await cloudinary.uploader.upload(imageUrl, {
        folder: "social-ops-ai-automation",
        public_id: data.inputs ? data.inputs.substring(0, 50) : undefined,
      });

      return uploadResult.secure_url;
    } catch (uploadError) {
      logger.warn("Cloudinary upload failed, using direct Horde URL", {
        error: (uploadError as Error).message,
      });
      return imageUrl; // fallback to direct Horde URL
    }
  } catch (error) {
    logger.error("Error generating/uploading image with AI Horde:", {
      error: (error as Error).message,
    });
    return null;
  }
}
