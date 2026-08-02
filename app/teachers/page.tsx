import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import {
  Upload,
  FolderTree,
  ScanSearch,
  PenLine,
  FileDown,
  Sparkles,
  CheckCircle2,
  Library,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "TutorMonkey Teachers — Worksheets From Your Materials",
  description:
    "Import your teaching materials, organize them by course, unit, and topic, and generate classroom-ready worksheets and answer keys written in your style.",
};

const pipelineSteps = [
  {
    number: "01",
    title: "Import",
    icon: Upload,
    description:
      "Drop in the PDFs, slide decks, handouts, and notes you already teach with. TutorMonkey reads your materials as-is.",
  },
  {
    number: "02",
    title: "Organize",
    icon: FolderTree,
    description:
      "Everything is filed by course, unit, and topic — so your library stays as structured as your syllabus.",
  },
  {
    number: "03",
    title: "Extract",
    icon: ScanSearch,
    description:
      "Questions and answer keys are pulled out automatically, ready to reuse, remix, or rebuild from scratch.",
  },
  {
    number: "04",
    title: "Generate",
    icon: PenLine,
    description:
      "New worksheets are written in your voice — the same question styles, phrasing, and difficulty your students expect.",
  },
  {
    number: "05",
    title: "Export",
    icon: FileDown,
    description:
      "Download classroom-ready PDFs with answer keys included. Print, post, or share in one click.",
  },
];

const featureCards = [
  {
    title: "Your style, preserved",
    icon: Sparkles,
    description:
      "TutorMonkey studies your existing worksheets and mirrors your question format, wording, and difficulty — so every new handout feels like it came from you.",
  },
  {
    title: "Answer keys, automatically",
    icon: CheckCircle2,
    description:
      "Every generated worksheet ships with a matching answer key, so grading takes minutes instead of evenings.",
  },
  {
    title: "A library that grows with you",
    icon: Library,
    description:
      "Reuse and remix questions across semesters. Your organized question bank compounds in value every single year.",
  },
];

/**
 * Google sign-in CTA.
 *
 * Links to /teachers/sign-in, which starts the Google OAuth flow (PKCE)
 * against Supabase. No credentials are collected or stored on this page.
 */
function ContinueWithGoogle({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Link
        href="/teachers/sign-in"
        title="Sign in with Google to open your Teachers workspace"
        aria-label="Continue with Google"
        className="group inline-flex items-center gap-3 rounded-full border border-gray-300 bg-white px-7 py-3.5 text-base font-medium text-gray-900 shadow-sm transition-all duration-300 hover:bg-gray-50 hover:shadow-md"
      >
        {/* Official Google "G" mark */}
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
          />
        </svg>
        Continue with Google
      </Link>
      <p
        className={`text-sm font-light ${
          dark ? "text-gray-400" : "text-gray-500"
        }`}
      >
        Secure Google sign-in — no password needed.
      </p>
    </div>
  );
}

export default function TeachersPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navigation />

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-1.5 text-sm font-medium text-gray-600 mb-8 animate-fade-in-up">
            <Sparkles className="h-4 w-4 text-gray-500" aria-hidden="true" />
            New · TutorMonkey Teachers
          </p>
          <h1 className="text-5xl md:text-7xl font-light text-gray-900 mb-8 animate-fade-in-up animation-delay-200 font-display text-balance">
            Your materials in.
            <br />
            <span className="text-gray-400">Classroom-ready worksheets out.</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-10 animate-fade-in-up animation-delay-400 max-w-3xl mx-auto font-light text-balance">
            Import the materials you already teach with, organize them by course,
            unit, and topic, and generate worksheets and answer keys written in
            your style — ready to print in minutes.
          </p>

          <div className="flex flex-col items-center gap-4 animate-fade-in-up animation-delay-600">
            <ContinueWithGoogle />
            <Link
              href="#workflow"
              className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors font-medium"
            >
              See how it works
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Pipeline: five steps */}
      <section id="workflow" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-light text-gray-900 mb-4 font-display text-balance">
              From your files to your classroom in five steps
            </h2>
            <p className="text-lg text-gray-600 font-light max-w-2xl mx-auto">
              One workflow that turns the way you already teach into a reusable,
              ever-growing worksheet library.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
            {pipelineSteps.map((step) => (
              <div
                key={step.number}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover-lift"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="font-display text-sm font-semibold tracking-widest text-gray-400">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600 font-light">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature showcase */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-light text-gray-900 mb-4 font-display text-balance">
              Built around your workflow
            </h2>
            <p className="text-lg text-gray-600 font-light max-w-2xl mx-auto">
              Designed for teachers who want their evenings back — without
              changing the way they teach.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {featureCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm p-8 shadow-sm hover-lift"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-900 mb-6">
                  <card.icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {card.title}
                </h3>
                <p className="text-gray-600 leading-relaxed font-light">
                  {card.description}
                </p>
              </div>
            ))}
          </div>

          {/* Organization breadcrumb mock */}
          <div className="mt-14 rounded-2xl border border-gray-200 bg-gray-50 px-6 py-5 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
            <span className="font-medium text-gray-900">Your library:</span>
            <span className="rounded-full bg-white border border-gray-200 px-3 py-1">
              AP Biology
            </span>
            <span className="text-gray-400" aria-hidden="true">→</span>
            <span className="rounded-full bg-white border border-gray-200 px-3 py-1">
              Unit 3 · Cellular Energetics
            </span>
            <span className="text-gray-400" aria-hidden="true">→</span>
            <span className="rounded-full bg-white border border-gray-200 px-3 py-1">
              Enzymes · 24 questions + key
            </span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6" style={{ backgroundColor: "var(--bgFooter)" }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-light text-white mb-6 font-display text-balance">
            Ready to build your worksheet library?
          </h2>
          <p className="text-lg text-gray-300 font-light mb-10 max-w-2xl mx-auto">
            Import once, reuse forever. TutorMonkey Teachers turns your existing
            materials into a fast, organized worksheet machine.
          </p>
          <ContinueWithGoogle dark />
          <p className="mt-8 text-sm text-gray-400 font-light">
            Questions?{" "}
            <Link
              href="/contact"
              className="text-gray-200 underline decoration-gray-500 underline-offset-4 hover:text-white transition-colors"
            >
              Contact the TutorMonkey team
            </Link>
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
