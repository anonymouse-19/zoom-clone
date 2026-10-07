/**
 * Logging in, signing up and signing out.
 *
 * Called by: the login and signup forms, and the profile menu's "Sign out".
 * Calls: lib/api.ts for the requests, lib/authToken.ts to keep or forget the token.
 *
 * After any of them, the React Query cache is emptied: everything in it (meeting
 * lists, details) belonged to the previous user, and must not be shown to the next one.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import * as api from "@/lib/api";
import { clearAuthToken, setAuthToken } from "@/lib/authToken";

import { queryKeys } from "./queries";

/** Login and signup both end the same way: keep the token, and "who am I" is known. */
function useStartSignedIn() {
  const queryClient = useQueryClient();
  return (result: api.AuthResult) => {
    setAuthToken(result.token);
    queryClient.clear();
    queryClient.setQueryData(queryKeys.me, result.user);
  };
}

export function useLogIn() {
  const startSignedIn = useStartSignedIn();
  return useMutation({ mutationFn: api.logIn, onSuccess: startSignedIn });
}

export function useSignUp() {
  const startSignedIn = useStartSignedIn();
  return useMutation({ mutationFn: api.signUp, onSuccess: startSignedIn });
}

/** Returns a function that signs out and goes to the login page. */
export function useLogOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return async () => {
    try {
      await api.logOut(); // end the session on the server too, so the token is dead
    } catch {
      // Server unreachable: still sign out of this browser.
    }
    clearAuthToken();
    queryClient.clear();
    queryClient.setQueryData(queryKeys.me, null);
    router.replace("/login");
  };
}
