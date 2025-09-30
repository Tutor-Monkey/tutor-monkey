"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import React from "react";
import { LINKS } from "@/components/links";
import Navigation from "@/components/Navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useIsClient } from "@/hooks/useIsClient";
import Footer from "@/components/Footer";

export default function TutorsPage() {
  const isClient = useIsClient?.() ?? true;

  const tutors = [
    {
      name: "Joshua Wu",
      school: "Junior at Plano West",
      subjects: ["Mathematics", "Physics", "Computer Science"],
      quote: "I love helping students understand complex concepts in simple ways.",
      rating: 5,
      image: LINKS.joshuaWuImage,
      achievements: ["AP Calculus BC", "Perfect PSAT Math", "Robotics Team"],
    },
    {
      name: "Sanjit Konda",
      school: "Junior at Plano West",
      subjects: ["Mathematics", "Science", "Computer Science"],
      quote:
        "Every student learns differently, and I adapt my teaching style accordingly.",
      rating: 5,
      image: LINKS.sanjitKondaImage,
      achievements: ["AP Calculus BC", "Perfect PSAT Math", "Science Fair Winner"],
    },
    {
      name: "James Chen",
      school: "Junior at Plano West",
      subjects: ["English", "History", "Test Prep"],
      quote:
        "Reading and writing are fundamental skills that open doors to every subject.",
      rating: 5,
      image: LINKS.jamesChenImage,
      achievements: ["AP Human Geography 5", "Speech & Debate", "4 AP Courses"],
    },
    {
      name: "Joshua Gan",
      school: "Junior at Plano West",
      subjects: ["Mathematics", "English", "Test Prep"],
      quote:
        "I believe in building confidence through understanding, not memorization.",
      rating: 5,
      image: LINKS.joshuaGanImage,
      achievements: ["Top 10 Class Rank", "Perfect PSAT Math", "BPA State Finalist"],
    },
    {
      name: "Skanda Gopikannan",
      school: "Junior at Plano West",
      subjects: ["English", "History", "Science"],
      quote: "History isn't just about dates—it's about understanding human nature.",
      rating: 5,
      image: LINKS.skandaGopikannanImage,
      achievements: [
        "National Debate Qualifier",
        "Multiple AP Courses",
        "State Tournament Winner",
      ],
    },
    {
      name: "Matthew Xie",
      school: "Junior at Plano West",
      subjects: ["Mathematics", "Physics", "Computer Science"],
      quote:
        "Physics is everywhere around us. I make it relatable and fun to learn.",
      rating: 5,
      image: LINKS.matthewXieImage,
      achievements: ["DHR on AMC10", "Gold on BPhO IPC", "AP Physics 1 (5)"],
    },
    {
      name: "Jennifer Duan",
      school: "Junior at Plano West",
      subjects: ["Science", "Mathematics", "English"],
      quote:
        "STEM isn't just for boys. I'm passionate about encouraging girls in science.",
      rating: 5,
      image: LINKS.jenniferDuanImage,
      achievements: ["6 AP Classes", "Science Fair Winner", "Girls in STEM Officer"],
    },
    {
      name: "Enoch Chan",
      school: "Junior at Plano West",
      subjects: ["Mathematics", "Science", "Computer Science"],
      quote:
        "I combine my love for music and math to make learning more engaging.",
      rating: 5,
      image: LINKS.enochChanImage,
      achievements: ["MATHCOUNTS State", "Perfect PSAT Math", "Robotics State Level"],
    },
    {
      name: "Ishaan Nirmal",
      school: "Junior at Plano West",
      subjects: ["Computer Science", "Mathematics", "Science"],
      quote:
        "AI is the future, and I want to help students understand it from the ground up.",
      rating: 5,
      image: LINKS.ishaanNirmalImage,
      achievements: [
        "UIL State Robotics Winner",
        "AI Club Founder",
        "Published Researcher",
      ],
    },
  ];

  // Framer Motion variants
  const fadeInUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -16 },
  };

  const container = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.08, when: "beforeChildren" },
    },
  };

  if (!isClient) return null;

  return (
    <main className="min-h-screen bg-white">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.h1
            className="text-5xl md:text-7xl font-light text-gray-900 mb-8 font-display"
            variants={fadeInUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5 }}
          >
            Meet Our Tutors
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto font-light"
            variants={fadeInUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Exceptional students from Plano West helping you succeed
          </motion.p>
        </div>
      </section>

      {/* Tutors Grid */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={container}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence>
              {tutors.map((tutor, index) => (
                <motion.div
                  key={tutor.name}
                  variants={fadeInUp}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover-lift"
                >
                  <div className="flex items-center mb-4">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden mr-4">
                      <Image
                        src={tutor.image || "/placeholder.svg"}
                        alt={tutor.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 font-display">
                        {tutor.name}
                      </h3>
                      <p className="text-gray-600 font-medium">{tutor.school}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Subjects:</h4>
                    <div className="flex flex-wrap gap-2">
                      {tutor.subjects.map((subject) => (
                        <span
                          key={subject}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-light"
                        >
                          {subject}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Achievements:</h4>
                    <ul className="space-y-1">
                      {tutor.achievements.map((achievement) => (
                        <li
                          key={achievement}
                          className="text-sm text-gray-600 font-light flex items-center"
                        >
                          <div className="w-1 h-1 bg-gray-400 rounded-full mr-2"></div>
                          {achievement}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-center">
                    <Link href="/book">
                      <Button className="w-full bg-gray-900 text-white hover:bg-gray-800 py-2 rounded-lg transition-all duration-300 font-medium text-sm">
                        Book with {tutor.name.split(" ")[0]}
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2
              className="text-4xl md:text-5xl font-light text-gray-900 mb-6 font-display"
              variants={fadeInUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5 }}
            >
              Why Our Tutors Excel
            </motion.h2>
          </div>

          <motion.div
            className="grid md:grid-cols-4 gap-8"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
          >
            {[
              { label: "Expert Tutors", value: "9" },
              { label: "Average Rating", value: "5.0" },
              { label: "Subjects Each", value: "6+" },
              { label: "Plano ISD Students", value: "100%" },
            ].map((stat) => (
              <motion.div key={stat.label} className="text-center" variants={fadeInUp}>
                <div className="text-4xl font-light text-gray-900 mb-2 font-display">
                  {stat.value}
                </div>
                <div className="text-gray-600 font-light">{stat.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

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
            Ready to Learn?
          </motion.h2>
          <motion.p
            className="text-xl text-gray-600 mb-12 font-light"
            variants={fadeInUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.07 }}
          >
            Book a session with one of our expert tutors and start achieving your academic goals
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
              <Link href="/join">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 px-8 py-4 text-lg rounded-lg transition-all duration-300 hover-lift font-medium"
                >
                  Become a Tutor
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
}