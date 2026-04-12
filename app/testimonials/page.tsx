"use client";

import Link from "next/link"
import { Button } from "@/components/ui/button"
import React from 'react'
import Navigation from "@/components/Navigation";
import { motion, AnimatePresence } from 'framer-motion';
import { useIsClient } from '@/hooks/useIsClient';
import Footer from "@/components/Footer";

export default function TestimonialsPage() {
  const isClient = useIsClient();
  const testimonials = [
    {
  quote: "We are so grateful for Matthew's support! His patience, knowledge, and engaging teaching style have greatly impacted my learning. He explains concepts clearly and makes lessons enjoyable, which has boosted my confidence and progress.",
  author: "J.H.",
  role: "Sophomore at Greenhill High School",
  rating: 5,
  category: "student"
},
{
  quote: "The AP Calculus help was exactly what I needed. My tutor walked me through tough problems and made sure I understood each step.",
  author: "L.C.",
  role: "Sophomore at Jasper High School",
  rating: 5,
  category: "student"
},
{
  quote: "I used to struggle in chemistry, but tutoring sessions made it much clearer. My grades improved and I feel more confident in class.",
  author: "M.L.",
  role: "Junior at Plano Senior",
  rating: 5,
  category: "student"
},
{
  quote: "Tutoring gave me a chance to ask questions I didn’t feel comfortable asking in class. It really helped me keep up with the material.",
  author: "E.C.",
  role: "Junior at Plano West",
  rating: 5,
  category: "student"
},
{
  quote: "I saw a big difference in how I approach homework after just a few sessions. I understand the concepts instead of just memorizing.",
  author: "--",
  role: "--",
  rating: 5,
  category: "student"
}
  ];

  if (!isClient) {
    return <main className="min-h-screen bg-white opacity-0" />;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key="testimonials-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-white"
      >
        {/* Navigation */}
        <Navigation />

        {/* Hero Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="pt-32 pb-20 px-6"
        >
          <div className="max-w-4xl mx-auto text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="text-5xl md:text-7xl font-light text-gray-900 mb-8 font-display"
            >
              What People Say
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto font-light"
            >
              Real stories from students and parents about their Tutor Monkey experience
            </motion.p>
          </div>
        </motion.section>

        {/* Testimonials Grid */}
        <motion.section 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="py-20 px-6"
        >
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.8 + (index * 0.1) }}
                  className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center mb-4">
                    <div className="text-yellow-400 flex">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <svg key={i} className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                  </div>
                  
                  <p className="text-gray-600 mb-6 font-light italic text-lg">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  
                  <div className="border-t border-gray-100 pt-4">
                    <div className="font-medium text-gray-900">{testimonial.author}</div>
                    <div className="text-sm text-gray-600 font-light">{testimonial.role}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Stats Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="py-20 px-6 bg-gray-50"
        >
          <div className="max-w-6xl mx-auto">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.4 }}
              className="text-center mb-16"
            >
              <h2 className="text-4xl md:text-5xl font-light text-gray-900 mb-6 font-display">
                Our Impact in Numbers
              </h2>
            </motion.div>
            
            <div className="grid md:grid-cols-2 gap-8">
              {[
                { number: "600+", label: "Students Helped" },
                { number: "400+", label: "Hours of Tutoring" }
              ].map((stat, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1.6 + (index * 0.1) }}
                  className="text-center"
                >
                  <div className="text-4xl font-light text-gray-900 mb-2 font-display">{stat.number}</div>
                  <div className="text-gray-600 font-light">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* CTA Section */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 2.0 }}
          className="py-20 px-6"
        >
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 2.2 }}
              className="text-4xl md:text-5xl font-light text-gray-900 mb-6 font-display"
            >
              Join Our Success Stories
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 2.4 }}
              className="text-xl text-gray-600 mb-12 font-light"
            >
              Start your academic journey with Tutor Monkey today
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 2.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link href="/book">
                <Button className="bg-gray-900 text-white hover:bg-gray-800 px-8 py-4 text-lg rounded-lg transition-all duration-300 hover:shadow-lg font-medium">
                  Book a Session
                </Button>
              </Link>
              <Link href="/tutors">
                <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg rounded-lg transition-all duration-300 hover:shadow-md font-medium">
                  Meet Our Tutors
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.section>

        {/* Footer */}
        <Footer />
      </motion.main>
    </AnimatePresence>
  );
}
