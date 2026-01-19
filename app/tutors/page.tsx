"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import React from "react";
import { LINKS } from "@/components/links";
import Navigation from "@/components/Navigation";
import { motion } from "framer-motion";
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
      roles: ["Tutor", "Founder", "Logistics"],
    },
    {
      name: "Sanjit Konda",
      school: "Junior at Plano Senior",
      subjects: ["Mathematics", "Science", "Computer Science"],
      quote:
        "Every student learns differently, and I adapt my teaching style accordingly.",
      rating: 5,
      image: LINKS.sanjitKondaImage,
      achievements: ["AP Calculus BC", "Perfect PSAT Math", "Science Fair Winner"],
      roles: ["Tutor", "Founder", "Logistics"],
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
      roles: ["Tutor", "Founder", "Education"],
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
      roles: ["Tutor", "Founder", "Education"],
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
      roles: ["Tutor", "Founder", "Education"],
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
      roles: ["Tutor"],
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
      roles: ["Tutor", "Outreach"],
    },
    {
      name: "Collin Cui",
      school: "Junior at Plano West",
      subjects: ["Community Outreach", "Partnerships"],
      quote: "Community connections power our mission to reach more students.",
      rating: 5,
      image: LINKS.collinCuiImage,
      achievements: ["Plano West Outreach Lead", "National Honor Society Volunteer"],
      roles: ["Outreach"],
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
      roles: ["Tutor", "Education"],
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
      roles: ["Tutor", "Education"],
    },
    // New member added here
    {
      name: "Sam Luong",
      school: "Sophomore at Jasper",
      subjects: ["Mathematics", "Computer Science", "Physics"],
      quote:
        "Creating a supportive learning environment is key to unlocking a student's potential.",
      rating: 5,
      image: LINKS.samLuongImage, // Assuming you have a link defined for Sam Luong
      achievements: ["Perfect PSAT Math", "Taking 8 AP Classes", ""],
      roles: ["Tutor", "Education"],
    },
  ];

  const memberSections = [
    {
      title: "Founders",
      role: "Founder",
      description: "The core team that launched TutorMonkey and shapes our mission.",
    },
    {
      title: "Education",
      role: "Education",
      description: "Curriculum leads who design lessons and keep our instruction sharp.",
    },
    {
      title: "Logistics",
      role: "Logistics",
      description: "Operations minds handling scheduling, platforms, and student support.",
    },
    {
      title: "Outreach",
      role: "Outreach",
      description: "Community connectors spreading the word and building partnerships.",
    },
  ];

  const tutorCount = tutors.filter((member) => member.roles.includes("Tutor")).length;

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
            Meet the Team
          </motion.h1>
          <motion.p
            className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto font-light"
            variants={fadeInUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            The founders, educators, and volunteers behind Tutor Monkey are dedicated to making tutoring accessible for every student.
          </motion.p>
        </div>
      </section>

      {/* Team Sections */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto space-y-20">
          {memberSections.map((section) => {
            const members = tutors.filter((tutor) => tutor.roles.includes(section.role));

            if (members.length === 0) {
              return null;
            }

            return (
              <div key={section.title} className="space-y-12">
                <motion.div
                  className="text-center"
                  variants={fadeInUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.5 }}
                >
                  <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4 font-display">
                    {section.title}
                  </h2>
                  {section.description && (
                    <p className="text-lg text-gray-600 font-light max-w-3xl mx-auto">
                      {section.description}
                    </p>
                  )}
                </motion.div>

                <motion.div
                  className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
                  variants={container}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, amount: 0.2 }}
                >
                  {members.map((tutor, index) => {
                    return (
                      <motion.div
                        key={tutor.name}
                        variants={fadeInUp}
                        transition={{ duration: 0.4, delay: index * 0.08 }}
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
                            <div className="mt-2 flex flex-wrap gap-2">
                              {tutor.roles.map((role) => (
                                <span
                                  key={role}
                                  className="px-3 py-1 bg-gray-900/5 text-gray-700 rounded-full text-xs font-medium uppercase tracking-wide"
                                >
                                  {role}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {tutor.subjects?.length ? (
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-900 mb-2">Focus Areas:</h4>
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
                        ) : null}

                        {tutor.achievements?.length ? (
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-900 mb-2">Highlights:</h4>
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
                        ) : null}
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            );
          })}
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
              { label: "Expert Tutors", value: String(tutorCount) },
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