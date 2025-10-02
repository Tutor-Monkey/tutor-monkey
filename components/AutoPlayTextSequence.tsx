"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutoPlayTextSequence } from '@/hooks/useAutoPlayTextSequence';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import Scene from './Scene';

export default function AutoPlayTextSequence() {
  const { currentTextIndex, textSequence } = useAutoPlayTextSequence();
  const currentText = textSequence[currentTextIndex];

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
          {/* Fixed height text container */}
          <div className="h-80 flex items-center justify-center mb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTextIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.32, ease: "circOut" }}
                className="w-full max-w-5xl"
              >
                <motion.h1
                  className="text-4xl md:text-6xl lg:text-7xl xl:text-8xl font-bold font-display leading-tight"
                  style={{ 
                    color: 'var(--textLight)'
                  }}
                  initial={{ scale: 0.97 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.32, ease: "circOut" }}
                >
                  {currentText?.headline}
                </motion.h1>

                {currentText?.subtext && (
                  <motion.p
                    className="text-lg md:text-xl lg:text-2xl font-semibold max-w-4xl mx-auto mt-6"
                    style={{ mixBlendMode: 'difference', color: 'white' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.32, delay: 0.08, ease: "circOut" }}
                  >
                    {currentText.subtext}
                  </motion.p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* CTA Buttons - fixed position */}
          <motion.div
            className="flex flex-col sm:flex-row gap-6 justify-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link href="/book">
                <Button className="bg-gray-900 text-white hover:bg-gray-800 px-8 py-4 text-lg rounded-lg transition-all duration-300 font-medium">
                  Book a Session
                </Button>
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link href="/resources">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg rounded-lg transition-all duration-300 font-medium"
                >
                  Explore Resources
                </Button>
              </Link>
            </motion.div>
          </motion.div>
          <motion.p
            className="mt-8 text-sm sm:text-base text-white/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            TutorMonkey is a non-profit organization dedicated to making high-quality tutoring accessible for every student.
          </motion.p>
        </div>
      </div>
    </div>
  );
}
