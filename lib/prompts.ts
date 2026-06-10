export type Tone = "Professional" | "Friendly" | "Direct";

export const SYSTEM_PROMPT =
  "You are an expert cold email copywriter. Extract the prospect's name, title, company, and any notable details from their LinkedIn text. Use these naturally to personalize the email without being creepy. Match the tone exactly.";

export function buildUserPrompt(
  offer: string,
  linkedinText: string,
  tone: Tone
): string {
  return `Write a personalized cold email for this prospect.

WHAT I OFFER:
${offer}

PROSPECT'S LINKEDIN PROFILE:
${linkedinText}

TONE: ${tone}

Respond in this exact format and nothing else:
SUBJECT: [subject line here]
---
EMAIL:
[email body 150-200 words]
---
FOLLOWUP:
[follow-up email 80-100 words]`;
}
