"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

const LINKS = {
  tutorApplication:
    "https://docs.google.com/forms/d/e/1FAIpQLSdT1gBzgk3VThdKw0-bX8gq6GZ7oxgLdWx6Z04DGvSk5NwXlQ/viewform",
};

export default function JoinPage() {
  return (
    <main className="flex min-h-screen flex-col bg-white">
      <Navigation />

      <section className="flex-1 px-6 pb-24 pt-32">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h1 className="mb-6 text-5xl font-light text-gray-900 font-display md:text-7xl">
            Join Tutor Monkey
          </h1>
          <p className="mb-10 max-w-2xl text-xl font-light text-gray-600">
            Tutor Monkey is a student-led volunteer tutoring program. If you want to help other students, use the application form below.
          </p>
          <div>
            <Link href={LINKS.tutorApplication} target="_blank" rel="noreferrer">
              <Button className="rounded-lg bg-gray-900 px-8 py-4 text-lg font-medium text-white transition-all duration-300 hover:bg-gray-800">
                Tutor Application Form
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
