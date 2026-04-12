"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import React, { useState } from "react";
import Navigation from "@/components/Navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useIsClient } from "@/hooks/useIsClient";
import Footer from "@/components/Footer";

export default function ContactPage() {
  const isClient = useIsClient?.() ?? true;
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  // Animation variants
  const fadeInUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -16 },
  } as const;

  // const slideInLeft = {
  //   hidden: { opacity: 0, x: -24 },
  //   show: { opacity: 1, x: 0 },
  //   exit: { opacity: 0, x: -24 },
  // } as const;

  const slideInRight = {
    hidden: { opacity: 0, x: 24 },
    show: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 24 },
  } as const;

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.08, when: "beforeChildren" },
    },
  } as const;

  if (!isClient) return null;

  return (
    <main 
        className="min-h-screen"
        style={{ backgroundColor: 'var(--bgMain)' }}
      >
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section 
        className="pt-32 pb-20 px-6"
        style={{ backgroundColor: 'var(--bgSection)' }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1
            className="text-5xl md:text-7xl font-light text-gray-900 mb-8 font-display"
            variants={fadeInUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5 }}
          >
            Get in Touch
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto font-light"
            variants={fadeInUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Have questions? We&apos;d love to hear from you. Send us a message and we&apos;ll respond as soon as possible.
          </motion.p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16">

            {/* Contact Information */}
            <motion.div
              variants={slideInRight}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
            >
              <h2 className="text-3xl font-light text-gray-900 mb-8 font-display">Contact Information</h2>

              <div className="space-y-8">
                <div className="flex items-start">
                  <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Email</h3>
                    <p className="text-gray-600 font-light">info@tutormonkey.co</p>
                    <p className="text-sm text-gray-500 font-light">We typically respond within 24 hours</p>
                  </div>
                </div>

                

                <div className="flex items-start">
                  <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Location</h3>
                    <p className="text-gray-600 font-light">Plano, Texas</p>
                    <p className="text-sm text-gray-500 font-light">Serving Plano ISD students</p>
                  </div>
                </div>
              </div>

              
            </motion.div>

            {/* FAQ Section moved inside second column */}
            <motion.div
              className="space-y-8"
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.15 }}
            >
              <div className="text-center mb-16">
                <motion.h2
                  className="text-4xl md:text-5xl font-light text-gray-900 mb-6 font-display"
                  variants={fadeInUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5 }}
                >
                  Frequently Asked Questions
                </motion.h2>
              </div>

              <AnimatePresence>
                {[
                  {
                    q: 'Is tutoring free? What about donations?',
                    a:
                      'Tutoring is free for all students. We suggest a $20 per hour donation to help us reach more students and host community events. Donations are optional and tax‑deductible through our fiscal sponsor (Hack Club).',
                  },
                  {
                    q: 'Do I have to donate to receive tutoring?',
                    a:
                      'No. We never deny or reduce services based on the ability to donate. Your support helps us reach more students, but it’s not required.',
                  },
                  {
                    q: 'How do I donate?',
                    a:
                      'Use the Donate button on our site to give through Hack Club. You’ll receive a tax receipt automatically via email.',
                  },
                  {
                    q: 'Do you offer online tutoring?',
                    a:
                      'Yes! We offer both in-person and online tutoring sessions. Online sessions are conducted via Zoom or Google Meet for your convenience.',
                  },
                  {
                    q: 'How do I book a session?',
                    a:
                      'You can book a session by filling out our booking form on the website, calling us, or sending us an email. We’ll get back to you within 24 hours to confirm details.',
                  },
                  {
                    q: 'What subjects do you offer?',
                    a:
                      'We offer tutoring in all major subjects including Mathematics, Science, English, History, Test Preparation, and Computer Science. All tutoring is aligned with Plano ISD curriculum.',
                  },
                ].map((item, i) => {
                  const isOpen = openFaq === item.q;

                  return (
                  <motion.div
                    key={item.q}
                    className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
                    variants={fadeInUp}
                    transition={{ duration: 0.45, delay: i * 0.08 }}
                    exit={{ opacity: 0, y: 8 }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : item.q)}
                      className="flex w-full items-center justify-between gap-4 p-6 text-left"
                      aria-expanded={isOpen}
                    >
                      <h3 className="text-xl font-medium text-gray-900 font-display">{item.q}</h3>
                      <span
                        className={`shrink-0 text-2xl leading-none text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-45" : ""}`}
                        aria-hidden="true"
                      >
                        +
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        >
                          <div className="px-6 pb-6">
                            <p className="text-gray-600 font-light">{item.a}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Removed original FAQ Section */}

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h2
            className="text-4xl md:text-5xl font-light text-gray-900 mb-6 font-display"
            variants={fadeInUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5 }}
          >
            Ready to Get Started?
          </motion.h2>
          <motion.p
            className="text-xl text-gray-600 mb-12 font-light"
            variants={fadeInUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.07 }}
          >
            Book your first tutoring session today and start achieving your academic goals
          </motion.p>
          <motion.div
            className="flex flex-col sm:flex-row gap-4 justify-center"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
          >
            <motion.div variants={fadeInUp}>
              <Link href="/book">
                <Button className="bg-gray-900 text-white hover:bg-gray-800 px-8 py-4 text-lg rounded-lg transition-all duration-300 hover-lift font-medium">
                  Book a Session
                </Button>
              </Link>
            </motion.div>
            <motion.div variants={fadeInUp}>
              <Link href="/tutors">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg rounded-lg transition-all duration-300 hover-lift font-medium"
                >
                  Meet Our Tutors
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
