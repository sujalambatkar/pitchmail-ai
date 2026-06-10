import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import { REPLY_SYSTEM_PROMPT, buildReplyPrompt, type Tone } from "@/lib/prompts";

export const maxDuration = 60;

const VALID_TONES: Tone[] = ["Professional", "Friendly", "Direct"];

export async function POST(req: Request) {
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

  if (!VALID_TONES.includes(tone)) {
    return Response.json(
      { error: "tone must be Professional, Friendly, or Direct" },
      { status: 400 }
    );
  }

  if (!process.env.GROQ_API_KEY) {
    return Response.json(
      { error: "GROQ_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

  const result = streamText({
    model: groq("llama-3.3-70b-versatile"),
    system: REPLY_SYSTEM_PROMPT,
    prompt: buildReplyPrompt(originalEmail, replyText, tone),
    temperature: 0.6,
  });

  return result.toDataStreamResponse();
}
