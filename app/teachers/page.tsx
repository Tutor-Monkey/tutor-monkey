import Link from "next/link";
import Navigation from "@/components/Navigation";
import { ArrowRight, Sparkles } from "lucide-react";

export const metadata = {
  title: "TutorMonkey Teachers — Beta",
  description: "Open the TutorMonkey Teachers beta dashboard.",
};

export default function TeachersPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navigation />
      <section className="flex min-h-[calc(100vh-80px)] items-center justify-center px-6 py-20">
        <div className="w-full max-w-3xl text-center">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Teachers beta
          </p>
          <h1 className="mb-6 font-display text-5xl font-light tracking-tight text-gray-900 md:text-7xl">
            Your teaching workspace.
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg font-light leading-8 text-gray-600 md:text-xl">
            Organize your course materials and build classroom-ready worksheets from one focused dashboard.
          </p>
          <Link
            href="/teachers/sign-in"
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-7 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-gray-800 hover:shadow-md"
          >
            Open dashboard
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <p className="mt-5 text-sm font-light text-gray-400">
            TutorMonkey Teachers is currently invite-reviewed beta access.
          </p>
        </div>
      </section>
    </main>
  );
}
