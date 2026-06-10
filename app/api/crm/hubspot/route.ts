import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { bodyTooLarge, MAX_TOKEN_LENGTH, tooLong } from "@/lib/validation";

const HUBSPOT_CONTACTS_URL =
  "https://api.hubapi.com/crm/v3/objects/contacts?limit=50&properties=firstname,lastname,email,jobtitle,company";

interface HubSpotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    jobtitle?: string;
    company?: string;
  };
}

/**
 * Proxies a HubSpot private-app token to the contacts API (browser can't call
 * HubSpot directly due to CORS). The token is never stored server-side.
 */
export async function POST(req: Request) {
  const limit = rateLimit(`crm:${getClientIp(req)}`, 10);
  if (!limit.allowed) return rateLimitResponse(limit);

  if (bodyTooLarge(req)) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return Response.json({ error: "Missing HubSpot token" }, { status: 400 });
  }

  if (typeof token !== "string" || tooLong(token, MAX_TOKEN_LENGTH)) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(HUBSPOT_CONTACTS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("hubspot fetch error:", err);
    return Response.json(
      { error: "Couldn't reach HubSpot. Please try again." },
      { status: 502 }
    );
  }

  if (res.status === 401) {
    return Response.json(
      { error: "HubSpot rejected the token — check it and try again" },
      { status: 401 }
    );
  }
  if (!res.ok) {
    return Response.json(
      { error: "HubSpot API error. Please try again." },
      { status: 502 }
    );
  }

  const data = (await res.json()) as { results?: HubSpotContact[] };

  const contacts = (data.results ?? [])
    .map((c) => ({
      id: c.id,
      name: [c.properties.firstname, c.properties.lastname]
        .filter(Boolean)
        .join(" ")
        .trim(),
      title: c.properties.jobtitle ?? "",
      company: c.properties.company ?? "",
      email: c.properties.email ?? "",
    }))
    .filter((c) => c.name || c.email);

  return Response.json({ contacts });
}
