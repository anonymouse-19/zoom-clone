/**
 * The login and signup forms, and the card around them.
 *
 * Rendered by: app/login/page.tsx and app/signup/page.tsx.
 * Calls: hooks/useAuth.ts. On success the token is saved, and the user goes to the page
 * they were trying to open ("?next="), or Home.
 *
 * The checks here (email shape, password length) only give quick feedback. The server
 * checks everything again, and its message is shown if it says no.
 */

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/hooks/queries";
import { useLogIn, useSignUp } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/authRedirect";

// Must match the backend (app/schemas/auth.py).
const MIN_PASSWORD_LENGTH = 8;
const SIMPLE_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// The seeded demo account (backend/app/seed_data.py), shown so anyone can try the app.
const DEMO_ACCOUNT = { email: "alex.morgan@example.com", password: "demo1234" };

const INPUT_CLASSES =
  "h-11 rounded-lg border border-line px-3 text-base font-normal focus:border-zoom-blue focus:outline-none";

/** Where to go once signed in, from the "?next=" in the URL. */
function useNextPath(): string {
  return safeNextPath(useSearchParams().get("next"));
}

/** Already signed in (e.g. opened /login in a new tab)? Go straight on. */
function useLeaveIfSignedIn(nextPath: string) {
  const { data: user } = useCurrentUser();
  const router = useRouter();
  useEffect(() => {
    if (user) {
      router.replace(nextPath);
    }
  }, [user, nextPath, router]);
}

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function LoginForm() {
  const nextPath = useNextPath();
  useLeaveIfSignedIn(nextPath);
  const router = useRouter();
  const logIn = useLogIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = email.trim() !== "" && password !== "" && !logIn.isPending;

  function submit(credentials: { email: string; password: string }) {
    logIn.mutate(credentials, { onSuccess: () => router.replace(nextPath) });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit({ email: email.trim(), password });
  }

  function logInAsDemoUser() {
    setEmail(DEMO_ACCOUNT.email);
    setPassword(DEMO_ACCOUNT.password);
    submit(DEMO_ACCOUNT);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
            className={INPUT_CLASSES}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className={INPUT_CLASSES}
          />
        </label>
        {logIn.error && (
          <p role="alert" className="-mt-2 text-sm text-zoom-red">
            {logIn.error.message}
          </p>
        )}
        <Button type="submit" disabled={!canSubmit} className="w-full">
          {logIn.isPending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <div className="mt-6 rounded-lg bg-zoom-blue-soft p-4 text-sm">
        <p>
          Just looking around? Use the demo account{" "}
          <span className="font-medium">({DEMO_ACCOUNT.email})</span>, which has sample meetings.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          onClick={logInAsDemoUser}
          disabled={logIn.isPending}
        >
          Log in as the demo user
        </Button>
      </div>

      <p className="mt-6 text-center text-sm text-ink-muted">
        New here?{" "}
        <Link
          href={`/signup${nextPath === "/" ? "" : `?next=${encodeURIComponent(nextPath)}`}`}
          className="font-semibold text-zoom-blue hover:underline"
        >
          Sign up free
        </Link>
      </p>
    </>
  );
}

export function SignupForm() {
  const nextPath = useNextPath();
  useLeaveIfSignedIn(nextPath);
  const router = useRouter();
  const signUp = useSignUp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isEmailValid = SIMPLE_EMAIL_PATTERN.test(email.trim());
  const isPasswordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = name.trim() !== "" && isEmailValid && isPasswordLongEnough && !signUp.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signUp.mutate(
      {
        name: name.trim(),
        email: email.trim(),
        password,
        // The browser's timezone, so meeting times show in local time from the start.
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      { onSuccess: () => router.replace(nextPath) },
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Your name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={100}
            autoFocus
            className={INPUT_CLASSES}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            aria-invalid={email !== "" && !isEmailValid}
            className={INPUT_CLASSES}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            maxLength={128}
            aria-describedby="password-hint"
            className={INPUT_CLASSES}
          />
          <span id="password-hint" className="text-xs font-normal text-ink-muted">
            At least {MIN_PASSWORD_LENGTH} characters.
          </span>
        </label>
        {signUp.error && (
          <p role="alert" className="-mt-2 text-sm text-zoom-red">
            {signUp.error.message}
          </p>
        )}
        <Button type="submit" disabled={!canSubmit} className="w-full">
          {signUp.isPending ? "Creating your account…" : "Sign up"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          href={`/login${nextPath === "/" ? "" : `?next=${encodeURIComponent(nextPath)}`}`}
          className="font-semibold text-zoom-blue hover:underline"
        >
          Log in
        </Link>
      </p>
    </>
  );
}
