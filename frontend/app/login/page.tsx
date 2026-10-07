/**
 * "/login": sign in with email and password, or with the demo account.
 * "/login?next=/meetings" returns to that page afterwards.
 */

import { Suspense } from "react";

import { AuthCard, LoginForm } from "@/components/auth/AuthForms";
import { MinimalHeader } from "@/components/layout/MinimalHeader";
import { Skeleton } from "@/components/ui/Feedback";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <MinimalHeader showHomeLink={false} />
      <main className="mx-auto mt-12 max-w-md px-4 pb-12">
        <AuthCard title="Log in">
          {/* useSearchParams needs a Suspense boundary (the URL isn't known at build time). */}
          <Suspense fallback={<Skeleton className="h-80" />}>
            <LoginForm />
          </Suspense>
        </AuthCard>
      </main>
    </div>
  );
}
