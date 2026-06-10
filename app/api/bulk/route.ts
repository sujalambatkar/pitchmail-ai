import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { SYSTEM_PROMPT, buildUserPrompt, type Tone } from "@/lib/prompts";
import { parseGeneration, parseSubjectVariants } from "@/lib/parse";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import {
  bodyTooLarge,
  MAX_OFFER_LENGTH,
  MAX_PROFILE_LENGTH,
  tooLong,
} from "@/lib/validation";

export const maxDuration = 60;

const VALID_TONES: Tone[] = ["Professional", "Friendly", "Direct"];

/** Generates one email for one bulk row and returns parsed JSON (non-streaming). */
export async function POST(req: Request) {
  // Bulk mode fires one request per CSV row from a 2-worker client pool, so
  // it gets a higher ceiling than the single-generation endpoints.
  const limit = rateLimit(`bulk:${getClientIp(req)}`, 40);
  if (!limit.allowed) return rateLimitResponse(limit);

  if (bodyTooLarge(req)) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: { offer?: string; linkedinText?: string; tone?: Tone };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { offer, linkedinText, tone } = body;

  if (!offer?.trim() || !linkedinText?.trim() || !tone) {
    return Response.json(
      { error: "Missing required fields: offer, linkedinText, tone" },
      { status: 400 }
    );
  }

  if (typeof offer !== "string" || typeof linkedinText !== "string") {
    return Response.json({ error: "Invalid field types" }, { status: 400 });
  }

  if (tooLong(offer, MAX_OFFER_LENGTH) || tooLong(linkedinText, MAX_PROFILE_LENGTH)) {
    return Response.json(
      {
        error: `offer must be under ${MAX_OFFER_LENGTH} characters and linkedinText under ${MAX_PROFILE_LENGTH} characters`,
      },
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
    const { text } = await generateText({
      model: groq("llama-3.3-70b-versatile"),
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(offer, linkedinText, tone),
      temperature: 0.7,
    });

    const { subjectsRaw, email, followup } = parseGeneration(text);
    const subjects = parseSubjectVariants(subjectsRaw);

    if (!email || subjects.length === 0) {
      return Response.json(
        { error: "Model returned an unexpected format" },
        { status: 502 }
      );
    }

    return Response.json({ subjects, email, followup });
  } catch (err) {
    console.error("bulk route error:", err);
    return Response.json(
      { error: "Generation failed. Please try again." },
      { status: 502 }
    );
  }
}
