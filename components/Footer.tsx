import React from 'react'
import Link from "next/link"

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: 'var(--bgFooter)',
        color: 'var(--textLight)',
      }}
      className="py-12 px-6"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Quick Links */}
          <div>
            <h3 className="font-medium mb-4">Quick Links</h3>
            <div className="space-y-2" style={{ color: 'var(--textMuted)' }}>
              <Link href="/subjects" className="hover:text-white transition-colors font-light block">Subjects</Link>
              <Link href="/tutors" className="hover:text-white transition-colors font-light block">Tutors</Link>
              <Link href="/contact" className="hover:text-white transition-colors font-light block">Contact</Link>
              <Link href="/join" className="hover:text-white transition-colors font-light block">Join</Link>
            </div>
          </div>
          
          {/* Contact Info */}
          <div>
            <h3 className="font-medium mb-4">Contact</h3>
            <div className="space-y-2" style={{ color: 'var(--textMuted)' }}>
              <p className="font-light">info@tutormonkey.co</p>
              <p className="font-light">(469) 609-7184</p>
              <p className="font-light">Plano, TX</p>
            </div>
          </div>
          
          {/* Social Icons */}
          
        </div>

        <div className="border-t border-gray-800 pt-6 text-center text-gray-400">
          <p className="font-light">© 2024 Tutor Monkey. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
