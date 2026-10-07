/**
 * App-wide client providers: the React Query cache and the toast notifications.
 *
 * Rendered by: app/layout.tsx, around every page. It's a client component because both
 * libraries keep state in the browser. The root layout itself stays a server component.
 */

"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { queryKeys } from "@/hooks/queries";
import { ApiError } from "@/lib/api";

// Treat fetched data as fresh for 30s: switching tabs or remounting a component within
// that window reuses the cache instead of refetching.
const DATA_FRESH_FOR_MS = 30_000;
const MAX_RETRIES = 1;
const FIRST_SERVER_ERROR_STATUS = 500;
const UNAUTHORIZED = 401;

/**
 * Retry a failed request once, but only if retrying could help.
 * A 4xx (404 not found, 403 forbidden, 422 invalid) will fail identically every time, so
 * retrying only delays the error screen. Network failures and 5xx might be temporary.
 */
function shouldRetry(failureCount: number, error: Error): boolean {
  const isClientError = error instanceof ApiError && error.status < FIRST_SERVER_ERROR_STATUS;
  return !isClientError && failureCount < MAX_RETRIES;
}

export function Providers({ children }: { children: ReactNode }) {
  // INTERVIEW: one QueryClient per browser tab. Created inside useState (not at module level) so
  // that during server rendering each request gets its own client and cached data is
  // never shared between users.
  const [queryClient] = useState(() => {
    // Any request refused with 401 means the sign-in has ended (e.g. it expired, or
    // the user signed out in another tab). Marking "nobody is signed in" makes
    // RequireAuth show the login page, wherever the 401 came from.
    function handleError(error: Error) {
      if (error instanceof ApiError && error.status === UNAUTHORIZED) {
        client.setQueryData(queryKeys.me, null);
      }
    }
    const client = new QueryClient({
      queryCache: new QueryCache({ onError: handleError }),
      mutationCache: new MutationCache({ onError: handleError }),
      defaultOptions: {
        queries: { staleTime: DATA_FRESH_FOR_MS, retry: shouldRetry },
      },
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Zoom shows its notifications at the top centre. */}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
