"use client";

import { useCompletion } from "@ai-sdk/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Tone } from "@/lib/prompts";
import {
  parseGeneration,
  parseReplyAnalysis,
  parseSubjectVariants,
} from "@/lib/parse";
import { parseCsv, toCsv } from "@/lib/csv";

const TONES: { value: Tone; hint: string }[] = [
  { value: "Professional", hint: "US-corporate polish, credible" },
  { value: "Friendly", hint: "Warm, builds trust fast" },
  { value: "Direct", hint: "Brief, value-first, no fluff" },
];

const SESSION_LIMIT = 5;
const BULK_ROW_LIMIT = 50;
const DAILY_COUNT_KEY = "pitchmail-daily-count";
const HUBSPOT_TOKEN_KEY = "pitchmail-hubspot-token";

type Mode = "single" | "bulk" | "reply";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readDailyCount(): number {
  try {
    const raw = localStorage.getItem(DAILY_COUNT_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date: string; count: number };
    return parsed.date === todayKey() ? parsed.count : 0;
  } catch {
    return 0;
  }
}

function writeDailyCount(count: number) {
  try {
    localStorage.setItem(
      DAILY_COUNT_KEY,
      JSON.stringify({ date: todayKey(), count })
    );
  } catch {
    // localStorage unavailable (private mode) — counter is cosmetic, ignore
  }
}

/* ---------------------------------- shared UI ---------------------------------- */

function SkeletonLines({ lines }: { lines: number }) {
  return (
    <div className="space-y-2.5 py-0.5" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="relative h-3.5 overflow-hidden rounded bg-zinc-100"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        >
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        </div>
      ))}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — nothing useful to do
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      disabled={!text}
      aria-label={`Copy ${label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all duration-150 ${
        copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 hover:shadow-sm active:scale-95"
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-none`}
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.5 4.5L6 12L2.5 8.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <rect
              x="5.5"
              y="5.5"
              width="8"
              height="8"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function CardShell({
  step,
  title,
  copyText,
  children,
}: {
  step: string;
  title: string;
  copyText: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500">
            {step}
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            {title}
          </h2>
        </div>
        <CopyButton text={copyText} label={title} />
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function TextBlock({
  text,
  isLoading,
  skeletonLines,
  emptyHint,
}: {
  text: string;
  isLoading: boolean;
  skeletonLines: number;
  emptyHint: string;
}) {
  if (isLoading && !text) return <SkeletonLines lines={skeletonLines} />;
  if (text)
    return (
      <p className="animate-fade-up whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
        {text}
      </p>
    );
  return <p className="text-sm italic text-zinc-300">{emptyHint}</p>;
}

function ToneSelector({
  value,
  onChange,
}: {
  value: Tone;
  onChange: (t: Tone) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-zinc-900">
        Tone
      </span>
      <div
        className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1"
        role="radiogroup"
        aria-label="Email tone"
      >
        {TONES.map(({ value: v, hint }) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              title={hint}
              onClick={() => onChange(v)}
              className={`rounded-md px-2 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                active
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-zinc-400">
        {TONES.find((t) => t.value === value)?.hint}
      </p>
    </div>
  );
}

function textareaClass(resizable = false) {
  return `w-full ${
    resizable ? "resize-y" : "resize-none"
  } rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 transition-shadow duration-150 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5`;
}

const primaryButtonClass =
  "flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-zinc-800 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-zinc-900 disabled:hover:shadow-sm";

const secondaryButtonClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-300 hover:text-zinc-900 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p className="animate-fade-up rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      {message}
    </p>
  );
}

/* ------------------------------- HubSpot import ------------------------------- */

interface CrmContact {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
}

function HubSpotImport({
  onPick,
}: {
  onPick: (profileText: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [contacts, setContacts] = useState<CrmContact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setToken(localStorage.getItem(HUBSPOT_TOKEN_KEY) ?? "");
    } catch {
      // ignore
    }
  }, []);

  const connect = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setContacts(data.contacts);
      try {
        localStorage.setItem(HUBSPOT_TOKEN_KEY, token);
      } catch {
        // ignore
      }
    } catch (e) {
      setContacts(null);
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const pick = (c: CrmContact) => {
    const lines = [
      [c.name, c.title && c.company ? `${c.title} at ${c.company}` : c.title || c.company]
        .filter(Boolean)
        .join(" · "),
      c.email ? `Email: ${c.email}` : "",
    ].filter(Boolean);
    onPick(lines.join("\n"));
    setOpen(false);
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        >
          <path
            d="M6 3.5L10.5 8L6 12.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        or import a contact from HubSpot
      </button>

      {open && (
        <div className="mt-2.5 animate-fade-up rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5">
          <label
            htmlFor="hs-token"
            className="mb-1.5 block text-xs font-medium text-zinc-700"
          >
            HubSpot private app token
          </label>
          <div className="flex gap-2">
            <input
              id="hs-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pat-na1-…"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
            />
            <button
              type="button"
              onClick={connect}
              disabled={!token.trim() || loading}
              className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Connecting…" : contacts ? "Refresh" : "Connect"}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">
            Stays in your browser — sent per-request, never stored on our
            server. Needs the <code>crm.objects.contacts.read</code> scope.
          </p>

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}

          {contacts && contacts.length === 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              Connected, but no contacts found.
            </p>
          )}

          {contacts && contacts.length > 0 && (
            <ul className="mt-2.5 max-h-44 divide-y divide-zinc-100 overflow-y-auto rounded-md border border-zinc-200 bg-white">
              {contacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-zinc-50"
                  >
                    <span className="text-xs font-medium text-zinc-900">
                      {c.name || c.email}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {[c.title, c.company].filter(Boolean).join(" · ") ||
                        c.email}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- single mode -------------------------------- */

function SingleMode({
  limitReached,
  onFinished,
}: {
  limitReached: boolean;
  onFinished: () => void;
}) {
  const [offer, setOffer] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");

  const { completion, complete, isLoading, error, setCompletion } =
    useCompletion({
      api: "/api/generate",
      onFinish: onFinished,
    });

  const { subjectsRaw, email, followup } = useMemo(
    () => parseGeneration(completion),
    [completion]
  );
  const subjects = useMemo(
    () => parseSubjectVariants(subjectsRaw),
    [subjectsRaw]
  );
  const bestScore = useMemo(
    () => Math.max(...subjects.map((s) => s.score ?? -1)),
    [subjects]
  );

  const formIncomplete = !offer.trim() || !linkedinText.trim();
  const hasAnyInput = offer !== "" || linkedinText !== "" || completion !== "";

  const handleGenerate = () => {
    if (formIncomplete || isLoading || limitReached) return;
    complete("generate", { body: { offer, linkedinText, tone } });
  };

  const handleReset = () => {
    setOffer("");
    setLinkedinText("");
    setTone("Professional");
    setCompletion("");
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* Input form */}
      <div className="lg:w-[44%]">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="offer"
                className="mb-1.5 block text-sm font-medium text-zinc-900"
              >
                What do you offer?
              </label>
              <textarea
                id="offer"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="I build AI chatbots for SaaS companies"
                rows={3}
                className={textareaClass()}
              />
            </div>

            <div>
              <label
                htmlFor="linkedin"
                className="mb-1.5 block text-sm font-medium text-zinc-900"
              >
                Paste their LinkedIn profile text
              </label>
              <textarea
                id="linkedin"
                value={linkedinText}
                onChange={(e) => setLinkedinText(e.target.value)}
                placeholder={
                  "Jane Doe · VP of Sales at Acme Corp (Austin, TX)\n10+ years scaling B2B revenue teams…"
                }
                rows={7}
                className={textareaClass(true)}
              />
              <HubSpotImport onPick={setLinkedinText} />
            </div>

            <ToneSelector value={tone} onChange={setTone} />

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading || formIncomplete || limitReached}
                className={primaryButtonClass}
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    Writing your pitch…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M8 1.5l1.8 4.2 4.2 1.8-4.2 1.8L8 13.5 6.2 9.3 2 7.5l4.2-1.8L8 1.5Z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Generate emails
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading || !hasAnyInput}
                className={secondaryButtonClass}
              >
                Reset
              </button>
            </div>

            {error && (
              <ErrorNote
                message={`Something went wrong — ${
                  error.message || "please try again."
                }`}
              />
            )}
          </div>
        </div>

        <p className="mt-4 px-1 text-center text-xs leading-relaxed text-zinc-400">
          Nothing is stored. Your inputs go straight to the model and
          disappear.
        </p>
      </div>

      {/* Output cards */}
      <div className="flex flex-1 flex-col gap-4">
        <CardShell
          step="1"
          title="Subject lines (A/B/C)"
          copyText={subjects.map((s) => s.text).join("\n")}
        >
          {isLoading && subjects.length === 0 ? (
            <SkeletonLines lines={3} />
          ) : subjects.length > 0 ? (
            <ul className="space-y-2">
              {subjects.map((s, i) => (
                <li
                  key={i}
                  className="flex animate-fade-up items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white text-[10px] font-semibold text-zinc-400 ring-1 ring-zinc-200">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1 text-sm font-medium text-zinc-900">
                    {s.text}
                  </span>
                  {s.score !== null && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                        s.score === bestScore
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                      title="AI-estimated open rate — not based on real send data"
                    >
                      ~{s.score}%{s.score === bestScore ? " · best" : ""}
                    </span>
                  )}
                  <CopyButton text={s.text} label={`subject variant ${i + 1}`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-zinc-300">
              Three subject line variants will appear here…
            </p>
          )}
          {subjects.length > 0 && (
            <p className="mt-2.5 text-[11px] text-zinc-400">
              Open rates are AI estimates, not from real send data.
            </p>
          )}
        </CardShell>

        <CardShell step="2" title="Email body" copyText={email}>
          <TextBlock
            text={email}
            isLoading={isLoading}
            skeletonLines={7}
            emptyHint="Your personalized email will appear here…"
          />
        </CardShell>

        <CardShell step="3" title="Follow-up email" copyText={followup}>
          <TextBlock
            text={followup}
            isLoading={isLoading}
            skeletonLines={4}
            emptyHint="Your follow-up will appear here…"
          />
        </CardShell>
      </div>
    </div>
  );
}

/* --------------------------------- bulk mode --------------------------------- */

interface BulkRow {
  name: string;
  linkedinText: string;
  status: "pending" | "working" | "done" | "error";
  subject?: string;
  email?: string;
  followup?: string;
  error?: string;
}

const BULK_TEMPLATE = `name,linkedin_text
Jane Doe,"VP of Sales at Acme Corp (Austin, TX). 10+ years scaling B2B revenue teams. Posts about outbound strategy."
John Smith,"CTO at TechFlow. Ex-Google. Building developer tools for fintech. Hiring backend engineers."`;

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function BulkMode({ onRowDone }: { onRowDone: () => void }) {
  const [offer, setOffer] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileNote, setFileNote] = useState("");
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setRows([]);
      setFileName(file.name);
      setFileNote("Couldn't find any rows in that file.");
      return;
    }

    // Detect a header row and locate name/profile columns.
    const header = parsed[0].map((h) => h.toLowerCase().trim());
    const profileCol = header.findIndex((h) =>
      /linkedin|profile|about|bio|summary|text/.test(h)
    );
    const nameCol = header.findIndex((h) => /name/.test(h));
    const hasHeader = profileCol !== -1 || nameCol !== -1;

    const dataRows = hasHeader ? parsed.slice(1) : parsed;
    const pCol = profileCol !== -1 ? profileCol : dataRows[0]?.length === 1 ? 0 : 1;
    const nCol = nameCol !== -1 ? nameCol : dataRows[0]?.length === 1 ? -1 : 0;

    const mapped: BulkRow[] = dataRows
      .map((r) => ({
        name: nCol >= 0 ? (r[nCol] ?? "").trim() : "",
        linkedinText: (r[pCol] ?? "").trim(),
        status: "pending" as const,
      }))
      .filter((r) => r.linkedinText);

    const capped = mapped.slice(0, BULK_ROW_LIMIT);
    setRows(capped);
    setFileName(file.name);
    setFileNote(
      mapped.length === 0
        ? "No rows with profile text found — check the column names."
        : mapped.length > BULK_ROW_LIMIT
          ? `${mapped.length} rows found — capped at ${BULK_ROW_LIMIT} for the free tier.`
          : `${capped.length} ${capped.length === 1 ? "profile" : "profiles"} ready.`
    );
  };

  const updateRow = (i: number, patch: Partial<BulkRow>) => {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );
  };

  const run = async () => {
    if (!offer.trim() || rows.length === 0 || running) return;
    setRunning(true);
    stopRef.current = false;

    // Reset any previous errors so a re-run retries them.
    setRows((prev) =>
      prev.map((r) =>
        r.status === "error" ? { ...r, status: "pending", error: undefined } : r
      )
    );

    const queue = rows
      .map((r, i) => (r.status === "done" ? -1 : i))
      .filter((i) => i !== -1);

    // Two workers keeps throughput reasonable without tripping rate limits.
    const workers = Array.from({ length: 2 }, async () => {
      while (queue.length > 0 && !stopRef.current) {
        const i = queue.shift();
        if (i === undefined) break;
        updateRow(i, { status: "working" });
        try {
          const res = await fetch("/api/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              offer,
              linkedinText: rows[i].linkedinText,
              tone,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          const best = [...data.subjects].sort(
            (a, b) => (b.score ?? 0) - (a.score ?? 0)
          )[0];
          updateRow(i, {
            status: "done",
            subject: best?.text ?? "",
            email: data.email,
            followup: data.followup,
          });
          onRowDone();
        } catch (e) {
          updateRow(i, {
            status: "error",
            error: e instanceof Error ? e.message : "Failed",
          });
        }
      }
    });

    await Promise.all(workers);
    setRunning(false);
  };

  const downloadResults = () => {
    const out: string[][] = [
      ["name", "subject", "email", "followup", "status"],
      ...rows.map((r) => [
        r.name,
        r.subject ?? "",
        r.email ?? "",
        r.followup ?? "",
        r.status === "done" ? "ok" : `failed: ${r.error ?? "not generated"}`,
      ]),
    ];
    downloadFile("pitchmail-bulk-emails.csv", toCsv(out), "text/csv");
  };

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const progress =
    rows.length > 0 ? ((doneCount + errorCount) / rows.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* Setup */}
      <div className="lg:w-[44%]">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="bulk-offer"
                className="mb-1.5 block text-sm font-medium text-zinc-900"
              >
                What do you offer?
              </label>
              <textarea
                id="bulk-offer"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                placeholder="I build AI chatbots for SaaS companies"
                rows={3}
                className={textareaClass()}
              />
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-zinc-900">
                Prospect CSV
              </span>
              <label
                htmlFor="bulk-file"
                className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-6 text-center transition-colors hover:border-zinc-400 hover:bg-zinc-50"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M3 13v2.5A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5V13"
                    stroke="#a1a1aa"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-sm font-medium text-zinc-700">
                  {fileName || "Upload CSV"}
                </span>
                <span className="text-xs text-zinc-400">
                  Columns: name, linkedin_text · up to {BULK_ROW_LIMIT} rows
                </span>
              </label>
              <input
                id="bulk-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-xs text-zinc-400">{fileNote}</p>
                <button
                  type="button"
                  onClick={() =>
                    downloadFile("pitchmail-template.csv", BULK_TEMPLATE, "text/csv")
                  }
                  className="text-xs font-medium text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-900 hover:underline"
                >
                  Get template
                </button>
              </div>
            </div>

            <ToneSelector value={tone} onChange={setTone} />

            <div className="space-y-2.5 pt-1">
              {!running ? (
                <button
                  type="button"
                  onClick={run}
                  disabled={!offer.trim() || rows.length === 0}
                  className={primaryButtonClass}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1.5l1.8 4.2 4.2 1.8-4.2 1.8L8 13.5 6.2 9.3 2 7.5l4.2-1.8L8 1.5Z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Generate {rows.length > 0 ? `${rows.length} emails` : "emails"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    stopRef.current = true;
                  }}
                  className={secondaryButtonClass}
                >
                  Stop after current batch
                </button>
              )}
              {(doneCount > 0 || errorCount > 0) && !running && (
                <button
                  type="button"
                  onClick={downloadResults}
                  className={secondaryButtonClass}
                >
                  Download results CSV ({doneCount} of {rows.length})
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 px-1 text-center text-xs leading-relaxed text-zinc-400">
          Profiles are processed one by one and never stored.
        </p>
      </div>

      {/* Results */}
      <div className="flex flex-1 flex-col gap-4">
        <section className="rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              Batch results
            </h2>
            {rows.length > 0 && (
              <span className="text-xs tabular-nums text-zinc-400">
                {doneCount} done
                {errorCount > 0 ? ` · ${errorCount} failed` : ""} ·{" "}
                {rows.length} total
              </span>
            )}
          </header>

          {(running || progress > 0) && rows.length > 0 && (
            <div className="h-1 w-full bg-zinc-100">
              <div
                className="h-1 bg-zinc-900 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm italic text-zinc-300">
              Upload a CSV to see your prospects here…
            </p>
          ) : (
            <ul className="max-h-[560px] divide-y divide-zinc-50 overflow-y-auto">
              {rows.map((r, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 shrink-0">
                    {r.status === "done" ? (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M13.5 4.5L6 12L2.5 8.5"
                            stroke="#059669"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    ) : r.status === "error" ? (
                      <span
                        className="flex h-4 w-4 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600"
                        title={r.error}
                      >
                        !
                      </span>
                    ) : r.status === "working" ? (
                      <span className="text-zinc-400">
                        <Spinner />
                      </span>
                    ) : (
                      <span className="block h-4 w-4 rounded-full border border-zinc-200" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {r.name || `Row ${i + 1}`}
                    </p>
                    <p className="truncate text-xs text-zinc-400">
                      {r.status === "done"
                        ? r.subject
                        : r.status === "error"
                          ? r.error
                          : r.linkedinText}
                    </p>
                  </div>
                  {r.status === "done" && r.email && (
                    <CopyButton
                      text={`Subject: ${r.subject}\n\n${r.email}`}
                      label={`email for ${r.name || `row ${i + 1}`}`}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* --------------------------------- reply mode --------------------------------- */

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  neutral: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  objection: "bg-amber-50 text-amber-700 ring-amber-200",
  rejection: "bg-red-50 text-red-700 ring-red-200",
};

function ReplyMode({
  limitReached,
  onFinished,
}: {
  limitReached: boolean;
  onFinished: () => void;
}) {
  const [originalEmail, setOriginalEmail] = useState("");
  const [replyText, setReplyText] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");

  const { completion, complete, isLoading, error, setCompletion } =
    useCompletion({
      api: "/api/reply",
      onFinish: onFinished,
    });

  const { sentiment, reading, response } = useMemo(
    () => parseReplyAnalysis(completion),
    [completion]
  );

  const sentimentStyle =
    SENTIMENT_STYLES[sentiment.toLowerCase()] ?? SENTIMENT_STYLES.neutral;

  const handleAnalyze = () => {
    if (!replyText.trim() || isLoading || limitReached) return;
    complete("analyze", { body: { originalEmail, replyText, tone } });
  };

  const handleReset = () => {
    setOriginalEmail("");
    setReplyText("");
    setTone("Professional");
    setCompletion("");
  };

  const hasAnyInput =
    originalEmail !== "" || replyText !== "" || completion !== "";

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* Input */}
      <div className="lg:w-[44%]">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="orig-email"
                className="mb-1.5 block text-sm font-medium text-zinc-900"
              >
                The email you sent{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <textarea
                id="orig-email"
                value={originalEmail}
                onChange={(e) => setOriginalEmail(e.target.value)}
                placeholder="Hi Jane, noticed you're scaling the sales team at Acme…"
                rows={4}
                className={textareaClass(true)}
              />
            </div>

            <div>
              <label
                htmlFor="their-reply"
                className="mb-1.5 block text-sm font-medium text-zinc-900"
              >
                Their reply
              </label>
              <textarea
                id="their-reply"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={
                  "Thanks for reaching out. We might be interested but the timing isn't great — also a bit worried about timezone overlap with an offshore team."
                }
                rows={6}
                className={textareaClass(true)}
              />
            </div>

            <ToneSelector value={tone} onChange={setTone} />

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={isLoading || !replyText.trim() || limitReached}
                className={primaryButtonClass}
              >
                {isLoading ? (
                  <>
                    <Spinner />
                    Reading between the lines…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M2.5 8s2-4.5 5.5-4.5S13.5 8 13.5 8s-2 4.5-5.5 4.5S2.5 8 2.5 8Z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                      />
                      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                    Analyze &amp; draft response
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading || !hasAnyInput}
                className={secondaryButtonClass}
              >
                Reset
              </button>
            </div>

            {error && (
              <ErrorNote
                message={`Something went wrong — ${
                  error.message || "please try again."
                }`}
              />
            )}
          </div>
        </div>

        <p className="mt-4 px-1 text-center text-xs leading-relaxed text-zinc-400">
          Replies are analyzed in-flight and never stored.
        </p>
      </div>

      {/* Output */}
      <div className="flex flex-1 flex-col gap-4">
        <CardShell step="1" title="What their reply means" copyText={reading}>
          {isLoading && !sentiment ? (
            <SkeletonLines lines={2} />
          ) : sentiment ? (
            <div className="animate-fade-up space-y-2">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${sentimentStyle}`}
              >
                {sentiment}
              </span>
              {reading && (
                <p className="text-sm leading-relaxed text-zinc-700">
                  {reading}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm italic text-zinc-300">
              Sentiment analysis will appear here…
            </p>
          )}
        </CardShell>

        <CardShell step="2" title="Suggested response" copyText={response}>
          <TextBlock
            text={response}
            isLoading={isLoading}
            skeletonLines={5}
            emptyHint="A ready-to-send response will appear here…"
          />
        </CardShell>
      </div>
    </div>
  );
}

/* ----------------------------------- page ----------------------------------- */

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "single", label: "Single email", hint: "One prospect, full control" },
  { value: "bulk", label: "Bulk CSV", hint: "Up to 50 prospects at once" },
  { value: "reply", label: "Reply analyzer", hint: "Turn replies into deals" },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("single");
  const [sessionCount, setSessionCount] = useState(0);
  const [dailyCount, setDailyCount] = useState<number | null>(null);

  useEffect(() => {
    setDailyCount(readDailyCount());
  }, []);

  const bumpDaily = useCallback(() => {
    setDailyCount((c) => {
      const next = (c ?? 0) + 1;
      writeDailyCount(next);
      return next;
    });
  }, []);

  const bumpSession = useCallback(() => {
    setSessionCount((c) => c + 1);
  }, []);

  const limitReached = sessionCount >= SESSION_LIMIT;

  return (
    <div className="relative min-h-screen">
      <div className="dot-grid pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60" />

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-[#fafafa]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 shadow-sm">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M1.5 3.5L8 8.5L14.5 3.5M2.5 13h11a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-11a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1Z"
                  stroke="white"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900">
              PitchMail <span className="font-normal text-zinc-400">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-500 shadow-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium tabular-nums text-zinc-700">
              {dailyCount ?? "–"}
            </span>
            {(dailyCount ?? 0) === 1 ? "email" : "emails"} generated today
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-20 pt-10">
        {/* Hero */}
        <div className="mb-8 text-center">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500 shadow-sm">
            Built for Indian freelancers &amp; agencies pitching US clients
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Win US clients from your inbox
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-zinc-500">
            Cold emails tuned for the India-to-US dynamic — credibility-first
            copy, US business English, and timezone-aware positioning that
            lands replies.
          </p>
        </div>

        {/* Mode switcher */}
        <div className="mb-8 flex justify-center">
          <div
            className="inline-grid grid-cols-3 gap-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-sm"
            role="tablist"
            aria-label="Workspace mode"
          >
            {MODES.map(({ value, label, hint }) => {
              const active = mode === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={hint}
                  onClick={() => setMode(value)}
                  className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-150 ${
                    active
                      ? "bg-zinc-900 text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Limit banner */}
        {limitReached && (
          <div className="mb-6 flex animate-fade-up items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 5.5V8.5M8 11h.01M8 1.5l7 12.5H1L8 1.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-medium">Free limit reached</span> — Pro is
            coming soon at ₹499/mo
          </div>
        )}

        {/* Workspaces stay mounted so switching modes doesn't lose state */}
        <div className={mode === "single" ? "" : "hidden"}>
          <SingleMode
            limitReached={limitReached}
            onFinished={() => {
              bumpSession();
              bumpDaily();
            }}
          />
        </div>
        <div className={mode === "bulk" ? "" : "hidden"}>
          <BulkMode onRowDone={bumpDaily} />
        </div>
        <div className={mode === "reply" ? "" : "hidden"}>
          <ReplyMode limitReached={limitReached} onFinished={bumpSession} />
        </div>
      </main>

      <footer className="border-t border-zinc-200/70 py-6">
        <p className="text-center text-xs text-zinc-400">
          PitchMail AI — built for Indian freelancers &amp; agencies · Powered
          by Groq
        </p>
      </footer>
    </div>
  );
}
