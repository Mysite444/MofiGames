// A small, dependency-free 5-field cron parser (minute hour day-of-month
// month day-of-week). Good enough for the schedules this admin panel
// offers (every-N-minutes, hourly, daily-at-HH:MM, etc.) without pulling
// in a package for it. Not a full POSIX cron implementation — ranges
// ("1-5") and lists ("1,15,30") and steps ("*/15") are supported; named
// months/days ("JAN", "MON") are not.

interface Field {
  matches(value: number): boolean;
}

function parseField(raw: string, min: number, max: number): Field {
  const parts = raw.split(",");
  const matchers = parts.map((part) => {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const [, rangePart, stepRaw] = stepMatch;
      const step = parseInt(stepRaw, 10);
      const [start, end] =
        rangePart === "*" ? [min, max] : rangePart.split("-").map((n) => parseInt(n, 10));
      return (value: number) => value >= start && value <= (end ?? max) && (value - start) % step === 0;
    }
    if (part === "*") {
      return () => true;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      return (value: number) => value >= start && value <= end;
    }
    const n = parseInt(part, 10);
    return (value: number) => value === n;
  });

  return { matches: (value: number) => matchers.some((m) => m(value)) };
}

export interface ParsedCron {
  minute: Field;
  hour: Field;
  dayOfMonth: Field;
  month: Field;
  dayOfWeek: Field;
}

export function parseCron(expr: string): ParsedCron | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  try {
    return {
      minute: parseField(fields[0], 0, 59),
      hour: parseField(fields[1], 0, 23),
      dayOfMonth: parseField(fields[2], 1, 31),
      month: parseField(fields[3], 1, 12),
      dayOfWeek: parseField(fields[4], 0, 6),
    };
  } catch {
    return null;
  }
}

/** Next UTC time (minute resolution) at or after `from` that matches the
 * cron expression. Searches up to ~2 years ahead before giving up (an
 * unsatisfiable expression, e.g. day-of-month 31 in February only). */
export function nextRunAfter(expr: string, from: Date = new Date()): Date | null {
  const parsed = parseCron(expr);
  if (!parsed) return null;

  const candidate = new Date(from.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  const LIMIT = 60 * 24 * 366 * 2; // minutes in ~2 years
  for (let i = 0; i < LIMIT; i++) {
    const minute = candidate.getUTCMinutes();
    const hour = candidate.getUTCHours();
    const dom = candidate.getUTCDate();
    const month = candidate.getUTCMonth() + 1;
    const dow = candidate.getUTCDay();

    if (
      parsed.minute.matches(minute) &&
      parsed.hour.matches(hour) &&
      parsed.dayOfMonth.matches(dom) &&
      parsed.month.matches(month) &&
      parsed.dayOfWeek.matches(dow)
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}
