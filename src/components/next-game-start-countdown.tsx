"use client";

import { useEffect, useMemo, useState } from "react";
import { Timer } from "lucide-react";

export const MIN_PARTICIPANTS_TO_START = 2;

function getPacificParts(timestampMs: number) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(timestampMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function getNextPacificNoon(fromMs: number) {
  const roundedNow = Math.ceil(fromMs / 60_000) * 60_000;
  for (let i = 0; i < 60 * 72; i += 1) {
    const candidate = roundedNow + i * 60_000;
    const pt = getPacificParts(candidate);
    if (pt.hour === 12 && pt.minute === 0) return candidate;
  }
  return null;
}

function formatCountdown(targetMs: number | null, now: number) {
  if (!targetMs) return null;
  const remaining = Math.max(0, targetMs - now);
  const totalSec = Math.floor(remaining / 1_000);
  const h = Math.floor(totalSec / 3_600);
  const m = Math.floor((totalSec % 3_600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function NextGameStartCountdown({
  enabled,
  className,
}: {
  enabled: boolean;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [enabled]);

  const nextStartAt = useMemo(
    () => (enabled ? getNextPacificNoon(now) : null),
    [enabled, now],
  );
  const countdown = formatCountdown(nextStartAt, now);

  if (!enabled || !countdown) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border border-ember/25 bg-ember/10 px-2.5 py-1.5 text-sm text-ember ${className ?? ""}`}
    >
      <Timer className="h-3.5 w-3.5" />
      Game starts in {countdown}
    </div>
  );
}
