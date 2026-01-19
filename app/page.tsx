"use client";

import React from 'react';
import Navigation from '@/components/Navigation';
import AutoPlayTextSequence from '@/components/AutoPlayTextSequence';
import TutorsSection from '@/components/TutorsSection';
import TestimonialsSection from '@/components/TestimonialsSection';
import Footer from '@/components/Footer';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsClient } from '@/hooks/useIsClient';


export default function Home() {
  const isClient = useIsClient();

  if (!isClient) {
    return <main className="min-h-screen bg-white opacity-0" />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key="home-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ backgroundColor: 'var(--bgMain)', color: 'var(--textDark)' }}
        className="min-h-screen"
      >
        <Navigation />
        <AutoPlayTextSequence />
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.0 }}>
          <section className="px-6 pt-10 pb-6">
            <div className="max-w-6xl mx-auto">
              <div className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-sm px-8 py-10 shadow-sm">
                <p className="text-sm uppercase tracking-[0.2em] text-gray-500 mb-3">501(c)(3) nonprofit</p>
                <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4 font-display">
                  Tutor Monkey is a student-led nonprofit delivering free tutoring.
                </h2>
                <p className="text-lg text-gray-600 mb-6 font-light max-w-3xl">
                  We are fiscally sponsored by Hack Club (HCB), providing transparent nonprofit operations and donor support.
                </p>
                <div className="flex flex-col lg:flex-row gap-8 items-start">
                  <div className="w-full lg:w-1/2">
                    <a
                      href="https://hcb.hackclub.com/tutor-monkey/fiscal_sponsorship_letter.pdf"
                      className="text-gray-900 underline decoration-gray-400 underline-offset-4 hover:text-gray-700 transition-colors"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View our fiscal sponsorship letter (PDF)
                    </a>
                  </div>
                  <div className="w-full lg:w-1/2 flex justify-center">
                    <iframe
                      src="https://hcb.hackclub.com/donations/start/tutor-monkey"
                      title="Tutor Monkey donation form"
                      style={{ border: 'none' }}
                      name="donateFrame"
                      scrolling="yes"
                      frameBorder="0"
                      marginHeight={0}
                      marginWidth={0}
                      allowFullScreen
                      className="w-full max-w-[480px] min-h-[520px] rounded-xl shadow-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
          <TutorsSection />
          <TestimonialsSection />
          <Footer />
        </motion.div>
      </motion.main>
    </AnimatePresence>
  );
}