import React from 'react'
import Image from "next/image"
import Link from "next/link"

import { motion } from 'framer-motion'
import { LINKS } from '@/components/links'

const tutors = [
  {
    name: "Joshua Wu",
    school: "Plano West",
    subjects: ["Math", "Physics"],
    image: LINKS.joshuaWuImage,
  },
  {
    name: "Sanjit Konda",
    school: "Plano West",
    subjects: ["Math", "Science"],
    image: LINKS.sanjitKondaImage,
  },
  {
    name: "James Chen",
    school: "Plano West",
    subjects: ["English", "History"],
    image: LINKS.jamesChenImage,
  },
];

export default function TutorsSection() {
  return (
    <section 
      className="py-20 px-6"
      style={{
        backgroundColor: 'var(--bgSection)',
        color: 'var(--textDark)',
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-6 md:gap-0">
          <motion.div
            className="w-full md:w-auto text-left"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 
              className="text-5xl md:text-6xl font-bold font-display"
              style={{ color: 'var(--textHeading)' }}
            >
              Meet Our Tutors
            </h2>
          </motion.div>
          <motion.div
            className="w-full md:w-auto flex justify-end items-center"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            viewport={{ once: true }}
          >
            <Link 
              href="/tutors" 
              className="group inline-flex items-center gap-2 text-lg md:text-2xl font-medium transition-colors"
              style={{ 
                color: 'var(--textLink)',
              }}
            >
              See all tutors
              <svg 
                className="w-6 h-6 transition-colors" 
                style={{ color: 'var(--textMuted)' }}
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </motion.div>
        </div>
        
        <div className="flex flex-wrap gap-8 justify-center">
          {tutors.map((tutor, index) => (
            <motion.div 
              key={tutor.name} 
              className="p-6 rounded-xl shadow min-w-[180px] min-h-[180px] flex-1 max-w-xs"
              style={{
                backgroundColor: 'var(--bgLight)',
                borderColor: 'var(--borderLight)',
                border: '1px solid'
              }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ 
                y: -10,
                transition: { duration: 0.3 }
              }}
            >
              <div className="text-center">
                <motion.div 
                  className="relative w-20 h-20 rounded-full overflow-hidden mx-auto mb-4"
                  whileHover={{ scale: 1.1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Image 
                    src={tutor.image || "/placeholder.svg"} 
                    alt={tutor.name} 
                    fill 
                    className="object-cover" 
                  />
                </motion.div>
                <h3 className="text-lg font-medium text-gray-900 mb-1 font-display">{tutor.name}</h3>
                <p className="text-sm text-gray-600 mb-3 font-light">{tutor.school}</p>
                <div className="flex flex-wrap gap-1 justify-center">
                  {tutor.subjects.map((subject) => (
                    <motion.span 
                      key={subject} 
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-light"
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.2 }}
                    >
                      {subject}
                    </motion.span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        

      </div>
    </section>
  )
} 