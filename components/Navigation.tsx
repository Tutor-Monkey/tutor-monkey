'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useIsClient } from '@/hooks/useIsClient'

export default function Navigation() {
  const pathname = usePathname()
  const isClient = useIsClient()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [pathname])

  if (!isClient) {
    return (
      <nav className="fixed top-4 left-0 right-0 z-50 pointer-events-none opacity-0" />
    )
  }

  return (
    
      <nav
        key="navigation"
        className="fixed top-4 left-0 right-0 z-50 pointer-events-none"
        role="navigation"
        aria-label="Primary"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div
            className="pointer-events-auto mx-auto flex items-center justify-between gap-2 sm:gap-4 rounded-full border border-white/20 shadow-lg ring-1 ring-black/10 bg-black/40 backdrop-blur-lg px-3 py-2"
          >
            {/* Logo */}
            <Link href="/" className="flex items-center shrink-0">
              <Image
                src="/images/tutormonkeylogo.png"
                alt="TutorMonkey logo"
                width={36}
                height={36}
                className="object-contain opacity-100 bg-white rounded-full"
                priority
              />
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden min-[796px]:flex items-center gap-10 font-semibold text-white">
              <Link href="/tutors" className="hover:opacity-80 transition-opacity">Team</Link>
              <Link href="/testimonials" className="hover:opacity-80 transition-opacity">Testimonials</Link>
              <Link href="/about" className="hover:opacity-80 transition-opacity">About</Link>
              <Link href="/contact" className="hover:opacity-80 transition-opacity">Contact</Link>
              <Link href="/resources" className="hover:opacity-80 transition-opacity">Resources</Link>
              <Link href="/ap-review" className="hover:opacity-80 transition-opacity">AP Review</Link>
            </div>

            {/* Desktop CTA */}
            <Link
              href="/book"
              className="hidden min-[796px]:inline-flex items-center rounded-full border border-white/40 bg-white/10 px-5 py-2 text-sm md:text-md font-medium shadow-sm backdrop-blur text-white hover:bg-white/20"
            >
              Book a session
            </Link>

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="inline-flex min-[796px]:hidden items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              onClick={() => setOpen(v => !v)}
              aria-controls="mobile-menu"
              aria-expanded={open}
              aria-label="Toggle menu"
            >
              <svg className={`h-5 w-5 ${open ? 'hidden' : 'block'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" /></svg>
              <svg className={`h-5 w-5 ${open ? 'block' : 'hidden'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <AnimatePresence>
            {open && (
              <motion.div
                key="mobile-menu"
                id="mobile-menu"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="pointer-events-auto min-[796px]:hidden mt-2 rounded-2xl border border-white/20 bg-black/50 backdrop-blur-xl ring-1 ring-black/10 shadow-lg overflow-hidden"
              >
                <div className="px-4 py-3 grid gap-1 text-white">
                  <Link href="/tutors" className="block rounded-lg px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>Tutors</Link>
                  <Link href="/testimonials" className="block rounded-lg px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>Testimonials</Link>
                  <Link href="/about" className="block rounded-lg px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>About</Link>
                  <Link href="/contact" className="block rounded-lg px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>Contact</Link>
                  <Link href="/resources" className="block rounded-lg px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>Resources</Link>
                  <Link href="/ap-review" className="block rounded-lg px-2 py-2 hover:bg-white/10" onClick={() => setOpen(false)}>AP Review</Link>
                  <Link href="/book" className="mt-1 inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20" onClick={() => setOpen(false)}>Book a session</Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>
    
  )
}
