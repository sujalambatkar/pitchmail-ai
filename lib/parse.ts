export interface SubjectVariant {
  text: string;
  score: number | null;
}

export interface ParsedGeneration {
  subjectsRaw: string;
  email: string;
  followup: string;
}

/** Split a (possibly still-streaming) completion into its three sections. */
export function parseGeneration(completion: string): ParsedGeneration {
  const [rawSubjects = "", rawEmail = "", rawFollowup = ""] =
    completion.split("---");
  return {
    subjectsRaw: rawSubjects.replace(/^\s*SUBJECTS?:\s*/i, "").trim(),
    email: rawEmail.replace(/^\s*EMAIL:\s*/i, "").trim(),
    followup: rawFollowup.replace(/^\s*FOLLOWUP:\s*/i, "").trim(),
  };
}

/**
 * Parse "1. Subject line | 54%" lines into variants. Tolerant of partial
 * lines so it can render while the response is still streaming.
 */
export function parseSubjectVariants(raw: string): SubjectVariant[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const [text, scorePart] = line.split("|").map((s) => s.trim());
      const match = scorePart?.match(/(\d+(?:\.\d+)?)\s*%/);
      return {
        text: text ?? "",
        score: match ? Number(match[1]) : null,
      };
    })
    .filter((v) => v.text.length > 0);
}

export interface ParsedReply {
  sentiment: string;
  reading: string;
  response: string;
}

/** Split a (possibly still-streaming) reply analysis into sentiment + response. */
export function parseReplyAnalysis(completion: string): ParsedReply {
  const [rawSentiment = "", rawResponse = ""] = completion.split("---");
  const sentimentLine = rawSentiment.replace(/^\s*SENTIMENT:\s*/i, "").trim();
  const [sentiment = "", ...rest] = sentimentLine.split(/—|--|-(?= )/);
  return {
    sentiment: sentiment.trim(),
    reading: rest.join("—").trim(),
    response: rawResponse.replace(/^\s*RESPONSE:\s*/i, "").trim(),
  };
}
