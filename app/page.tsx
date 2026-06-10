"use client";

import { useCompletion } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Tone } from "@/lib/prompts";

const TONES: { value: Tone; hint: string }[] = [
  { value: "Professional", hint: "Polished & credible" },
  { value: "Friendly", hint: "Warm & human" },
  { value: "Direct", hint: "Short & punchy" },
];

const SESSION_LIMIT = 5;
const DAILY_COUNT_KEY = "pitchmail-daily-count";

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

/** Split the streamed completion into subject / email / follow-up sections. */
function parseCompletion(completion: string) {
  const [rawSubject = "", rawEmail = "", rawFollowup = ""] =
    completion.split("---");
  return {
    subject: rawSubject.replace(/^\s*SUBJECT:\s*/i, "").trim(),
    email: rawEmail.replace(/^\s*EMAIL:\s*/i, "").trim(),
    followup: rawFollowup.replace(/^\s*FOLLOWUP:\s*/i, "").trim(),
  };
}

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
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all duration-150 ${
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

function OutputCard({
  step,
  title,
  text,
  isLoading,
  skeletonLines,
  emptyHint,
  mono,
}: {
  step: string;
  title: string;
  text: string;
  isLoading: boolean;
  skeletonLines: number;
  emptyHint: string;
  mono?: boolean;
}) {
  const showSkeleton = isLoading && !text;

  return (
    <section className="group rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow duration-200 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500">
            {step}
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            {title}
          </h2>
        </div>
        <CopyButton text={text} label={title} />
      </header>
      <div className="px-5 py-4">
        {showSkeleton ? (
          <SkeletonLines lines={skeletonLines} />
        ) : text ? (
          <p
            className={`animate-fade-up whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 ${
              mono ? "font-medium text-zinc-900" : ""
            }`}
          >
            {text}
          </p>
        ) : (
          <p className="text-sm italic text-zinc-300">{emptyHint}</p>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [offer, setOffer] = useState("");
  const [linkedinText, setLinkedinText] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [sessionCount, setSessionCount] = useState(0);
  const [dailyCount, setDailyCount] = useState<number | null>(null);

  useEffect(() => {
    setDailyCount(readDailyCount());
  }, []);

  const { completion, complete, isLoading, error, setCompletion } =
    useCompletion({
      api: "/api/generate",
      onFinish: () => {
        setSessionCount((c) => c + 1);
        setDailyCount((c) => {
          const next = (c ?? 0) + 1;
          writeDailyCount(next);
          return next;
        });
      },
    });

  const { subject, email, followup } = useMemo(
    () => parseCompletion(completion),
    [completion]
  );

  const limitReached = sessionCount >= SESSION_LIMIT;
  const formIncomplete = !offer.trim() || !linkedinText.trim();
  const hasAnyInput =
    offer !== "" || linkedinText !== "" || completion !== "";

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
              PitchMail{" "}
              <span className="font-normal text-zinc-400">AI</span>
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
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Cold emails that actually get replies
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-zinc-500">
            Paste a LinkedIn profile, pick a tone, and get a personalized
            pitch with a follow-up — in seconds.
          </p>
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
            <span className="font-medium">Free limit reached</span> — upgrade
            coming soon
          </div>
        )}

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Left column — input form */}
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
                    className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 transition-shadow duration-150 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5"
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
                      "Jane Doe · VP of Sales at Acme Corp\n10+ years scaling B2B revenue teams…"
                    }
                    rows={7}
                    className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 transition-shadow duration-150 focus:border-zinc-400 focus:outline-none focus:ring-4 focus:ring-zinc-900/5"
                  />
                </div>

                <div>
                  <span className="mb-1.5 block text-sm font-medium text-zinc-900">
                    Tone
                  </span>
                  <div
                    className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1"
                    role="radiogroup"
                    aria-label="Email tone"
                  >
                    {TONES.map(({ value, hint }) => {
                      const active = tone === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          title={hint}
                          onClick={() => setTone(value)}
                          className={`rounded-md px-2 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                            active
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-500 hover:text-zinc-800"
                          }`}
                        >
                          {value}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-400">
                    {TONES.find((t) => t.value === tone)?.hint}
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isLoading || formIncomplete || limitReached}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-zinc-800 hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-zinc-900 disabled:hover:shadow-sm"
                  >
                    {isLoading ? (
                      <>
                        <svg
                          className="h-4 w-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
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
                        Writing your pitch…
                      </>
                    ) : (
                      <>
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
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
                    className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-300 hover:text-zinc-900 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reset
                  </button>
                </div>

                {error && (
                  <p className="animate-fade-up rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                    Something went wrong — {error.message || "please try again."}
                  </p>
                )}
              </div>
            </div>

            <p className="mt-4 px-1 text-center text-xs leading-relaxed text-zinc-400">
              Nothing is stored. Your inputs go straight to the model and
              disappear.
            </p>
          </div>

          {/* Right column — output cards */}
          <div className="flex flex-1 flex-col gap-4">
            <OutputCard
              step="1"
              title="Subject line"
              text={subject}
              isLoading={isLoading}
              skeletonLines={1}
              emptyHint="Your subject line will appear here…"
              mono
            />
            <OutputCard
              step="2"
              title="Email body"
              text={email}
              isLoading={isLoading}
              skeletonLines={7}
              emptyHint="Your personalized email will appear here…"
            />
            <OutputCard
              step="3"
              title="Follow-up email"
              text={followup}
              isLoading={isLoading}
              skeletonLines={4}
              emptyHint="Your follow-up will appear here…"
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200/70 py-6">
        <p className="text-center text-xs text-zinc-400">
          PitchMail AI — built for freelancers &amp; SDRs · Powered by Groq
        </p>
      </footer>
    </div>
  );
}
