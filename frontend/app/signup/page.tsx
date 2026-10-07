/**
 * "/signup": create an account (name, email, password). It comes back signed in, with
 * its own Personal Meeting Room.
 */

import { Suspense } from "react";

import { AuthCard, SignupForm } from "@/components/auth/AuthForms";
import { MinimalHeader } from "@/components/layout/MinimalHeader";
import { Skeleton } from "@/components/ui/Feedback";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <MinimalHeader showHomeLink={false} />
      <main className="mx-auto mt-12 max-w-md px-4 pb-12">
        <AuthCard title="Sign up free">
          {/* useSearchParams needs a Suspense boundary (the URL isn't known at build time). */}
          <Suspense fallback={<Skeleton className="h-96" />}>
            <SignupForm />
          </Suspense>
        </AuthCard>
      </main>
    </div>
  );
}
