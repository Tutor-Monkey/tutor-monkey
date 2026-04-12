"use client";

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Scene from './Scene';

export default function AutoPlayTextSequence() {
  return (
    <div className="h-screen relative overflow-hidden">
      <Scene />

      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
        {/* Fading overlay for readability */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: `linear-gradient(180deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 30%, rgba(0,0,0,0) 100%)`,
            opacity: 0.8
          }}
        />
        <div className="relative text-center w-full max-w-6xl mx-auto" style={{zIndex:2}}>
          <div className="max-w-5xl mx-auto mb-8">
            <motion.p
              className="mb-4 text-sm uppercase tracking-[0.3em] text-blue-200"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              New AP Reviews
            </motion.p>
            <motion.h1
              className="text-4xl md:text-6xl lg:text-7xl xl:text-8xl font-bold font-display leading-tight"
              style={{ color: 'var(--textLight)' }}
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: "circOut" }}
            >
              1,800+ AP practice questions, live now.
            </motion.h1>
            <motion.p
              className="text-lg md:text-xl lg:text-2xl font-semibold max-w-4xl mx-auto mt-6 text-white"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08, ease: "circOut" }}
            >
              Study AP Statistics, AP Calculus BC, AP Physics 1, and more with detailed explanations and progress tracking.
            </motion.p>
            <motion.p
              className="mt-5 text-sm sm:text-base text-white/80"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.16 }}
            >
              TutorMonkey is a student-led nonprofit delivering completely free, high-quality education to every learner.
            </motion.p>
          </div>

          <motion.div
            className="flex flex-col sm:flex-row gap-6 justify-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link href="/ap-review">
                <Button className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-4 text-lg rounded-lg transition-all duration-300 font-medium">
                  Explore AP Reviews
                </Button>
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link href="/book">
                <Button
                  variant="outline"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20 px-8 py-4 text-lg rounded-lg transition-all duration-300 font-medium"
                >
                  Book a Session
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
