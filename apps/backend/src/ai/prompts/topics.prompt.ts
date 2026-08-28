export const MONTHLY_TOPICS_PROMPT = `Generate exactly 30 unique Bangla topic ideas for Facebook posts.

Context:
- I am a web developer selling web development, business website, landing page, ecommerce, automation, performance optimization, and maintenance services.
- The posts should educate Bangla-speaking business owners, startup founders, freelancers, and small companies about web development and technology.
- Each topic should naturally create demand for my services without sounding spammy.

Rules:
- Return ONLY a valid JSON array of strings.
- Every string must be in Bangla.
- Keep each topic specific and practical.
- Mix educational, problem-aware, trust-building, and soft-selling angles.
- Do not include markdown formatting, numbering, explanations, or code fences.

Example: ["আপনার ব্যবসার জন্য দ্রুত লোডিং ওয়েবসাইট কেন জরুরি", "ল্যান্ডিং পেজ কীভাবে বেশি ক্লায়েন্ট আনতে সাহায্য করে"]`;
