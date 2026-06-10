import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { REPLY_SYSTEM_PROMPT, buildReplyPrompt, type Tone } from "@/lib/prompts";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { bodyTooLarge, MAX_REPLY_LENGTH, tooLong } from "@/lib/validation";

export const maxDuration = 60;

const VALID_TONES: Tone[] = ["Professional", "Friendly", "Direct"];

export async function POST(req: Request) {
  const limit = rateLimit(`reply:${getClientIp(req)}`, 10);
  if (!limit.allowed) return rateLimitResponse(limit);

  if (bodyTooLarge(req)) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: { originalEmail?: string; replyText?: string; tone?: Tone };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { originalEmail = "", replyText, tone } = body;

  if (!replyText?.trim() || !tone) {
    return Response.json(
      { error: "Missing required fields: replyText, tone" },
      { status: 400 }
    );
  }

  if (typeof replyText !== "string" || typeof originalEmail !== "string") {
    return Response.json({ error: "Invalid field types" }, { status: 400 });
  }

  if (tooLong(replyText, MAX_REPLY_LENGTH) || tooLong(originalEmail, MAX_REPLY_LENGTH)) {
    return Response.json(
      { error: `Fields must be under ${MAX_REPLY_LENGTH} characters` },
      { status: 400 }
    );
  }

  if (!VALID_TONES.includes(tone)) {
    return Response.json(
      { error: "tone must be Professional, Friendly, or Direct" },
      { status: 400 }
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return Response.json(
      { error: "Server is not configured correctly" },
      { status: 500 }
    );
  }

  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const result = streamText({
      model: groq("llama-3.3-70b-versatile"),
      system: REPLY_SYSTEM_PROMPT,
      prompt: buildReplyPrompt(originalEmail, replyText, tone),
      temperature: 0.6,
    });

    return result.toDataStreamResponse();
  } catch (err) {
    console.error("reply route error:", err);
    return Response.json(
      { error: "Failed to analyze. Please try again." },
      { status: 502 }
    );
  }
}
