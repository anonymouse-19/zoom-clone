/**
 * The current time, re-rendering the caller every `intervalMs`.
 *
 * Returns null on the server and during the first browser render. The server and the
 * browser render at different moments, so printing the time straight away would make
 * their HTML differ (a "hydration mismatch"). Callers show a placeholder while it's null.
 */

import { useEffect, useState } from "react";

export function useNow(intervalMs: number): Date | null {
  // INTERVIEW: starts as null so the server HTML and the first browser render match.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // The first tick happens right away; after that, once per interval.
    const tick = () => setNow(new Date());
    const firstTick = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    // Cleanup: stop both timers when the component unmounts or the interval changes.
    return () => {
      clearTimeout(firstTick);
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
