export type Tone = "Professional" | "Friendly" | "Direct";

export const SYSTEM_PROMPT = `You are an expert cold email copywriter who specializes in helping Indian freelancers and agencies win clients in the US and Europe. You understand this market's dynamics: prospects often carry unconscious skepticism about offshore work, so the email must build credibility fast through specificity and proof — never defensiveness. Write in natural, modern US business English: short sentences, value first, no filler. Never use Indian-English formalisms ("kindly", "do the needful", "respected sir/madam", "revert back"). Mention timezone overlap or async-friendly working style only when it genuinely strengthens the pitch. Extract the prospect's name, title, company, and any notable details from their LinkedIn text and use them naturally to personalize the email without being creepy. Match the requested tone exactly.`;

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
SUBJECTS:
1. [subject line variant] | [estimated open rate as a percentage, e.g. 54%]
2. [different subject line variant] | [estimated open rate]
3. [different subject line variant] | [estimated open rate]
---
EMAIL:
[email body 150-200 words]
---
FOLLOWUP:
[follow-up email 80-100 words]

The three subject lines must take genuinely different angles (e.g. curiosity, direct value, personalized detail). Open-rate estimates are your best judgment based on subject line length, specificity, and personalization.`;
}

export const REPLY_SYSTEM_PROMPT = `You are an expert at handling replies to cold emails, advising Indian freelancers and agencies selling to US and European clients. Read the prospect's reply, classify its sentiment honestly (do not sugarcoat a rejection), and draft a response that moves the deal forward. Handle objections about price, timezone, or offshore quality with confidence and specifics, never defensiveness. Write in natural, modern US business English with no Indian-English formalisms ("kindly", "do the needful", "revert back"). Match the requested tone exactly. Keep the response short — busy prospects skim.`;

export function buildReplyPrompt(
  originalEmail: string,
  replyText: string,
  tone: Tone
): string {
  return `A prospect replied to my cold email. Help me respond.

${originalEmail.trim() ? `THE EMAIL I SENT:\n${originalEmail}\n\n` : ""}THEIR REPLY:
${replyText}

TONE FOR MY RESPONSE: ${tone}

Respond in this exact format and nothing else:
SENTIMENT: [Positive | Neutral | Objection | Rejection] — [one short sentence reading what their reply really means]
---
RESPONSE:
[suggested response, 60-120 words, ready to send]`;
}
