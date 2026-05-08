"use client";


import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import React, { useState } from 'react'
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client (client-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function BookPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setStatus('loading');
  setMessage('');

  const form = e.currentTarget;
  const fd = new FormData(form);

  const val = (name: string) => {
    const v = fd.get(name);
    if (v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  const payload = {
    child_first_name: String(fd.get('child_first_name') || ''), // required
    child_last_name:  String(fd.get('child_last_name')  || ''), // required
    parent_email:     String(fd.get('parent_email')     || ''), // required
    parent_phone:     val('parent_phone'),
    school:           val('school'),
    grade:            val('grade'),
    subject:          val('subject'),
    specific_topic:   val('specific_topic'),
    preferred_tutor:  val('preferred_tutor'),
    session_type:     val('session_type'), // now null if not chosen
    preferred_times:  val('preferred_times'),
  };

  const { error } = await supabase.from('bookings').insert(payload);

  if (error) {
    console.error(error);
    setStatus('error');
    setMessage('Something went wrong. Please try again.');
    return;
  }

  form.reset();
  setStatus('success');
  setMessage('Thanks — we received your request. We will reach out within 24 hours.');
}

  return (
    <main className="min-h-screen bg-white">
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-7xl font-light text-gray-900 mb-8 animate-fade-in-up font-display">
            Book a Session
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-12 animate-fade-in-up animation-delay-200 max-w-3xl mx-auto font-light">
            Schedule a personalized tutoring session for your child with one of our expert tutors
          </p>
        </div>
        {/* Donation Model Section */}
        <div className="max-w-3xl mx-auto text-center mt-8">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 font-display">Free Tutoring, Powered by Donations</h2>
          <p className="text-lg text-gray-700 mb-6">
            Our tutoring is free for all students. We rely on donations to support our mission and pay our tutors.
          </p>

          <div className="inline-block bg-gray-900 text-white rounded-full px-5 py-2 text-base font-medium mb-8">
            Suggested donation: $20 per hour
          </div>

          <div className="flex flex-col md:flex-row gap-6 justify-center mb-6">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex-1">
              <h3 className="text-lg font-semibold mb-2">1-on-1 Tutoring</h3>
              <p className="text-gray-700">Always free. Most families donate about $20 per hour.</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 flex-1">
              <h3 className="text-lg font-semibold mb-2">Group Sessions</h3>
              <p className="text-gray-700">Always free. Suggested: $15 per student per hour.</p>
            </div>
          </div>

          <p className="text-sm text-gray-600">
            Donations are optional and tax‑deductible through our fiscal sponsor (Hack Club).
          </p>
        </div>
      </section>

      {/* Booking Form */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 animate-fade-in-up">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="firstName" className="text-gray-900 font-medium">Child&apos;s First Name</Label>
                  <Input id="firstName" name="child_first_name" type="text" className="mt-2" placeholder="Enter your child&apos;s first name" required />
                </div>
                <div>
                  <Label htmlFor="lastName" className="text-gray-900 font-medium">Child&apos;s Last Name</Label>
                  <Input id="lastName" name="child_last_name" type="text" className="mt-2" placeholder="Enter your child&apos;s last name" required />
                </div>
              </div>
              
              <div>
                <Label htmlFor="email" className="text-gray-900 font-medium">Parent Email Address</Label>
                <Input id="email" name="parent_email" type="email" className="mt-2" placeholder="Enter your email address" required />
              </div>
              
              <div>
                <Label htmlFor="phone" className="text-gray-900 font-medium">Parent Phone Number</Label>
                <Input id="phone" name="parent_phone" type="tel" className="mt-2" placeholder="Enter your phone number" />
              </div>
              
              <div>
                <Label htmlFor="school" className="text-gray-900 font-medium">Child&apos;s School</Label>
                <Input id="school" name="school" type="text" className="mt-2" placeholder="Enter your child's school" />
              </div>
              
              <div>
                <Label htmlFor="grade" className="text-gray-900 font-medium">Child&apos;s Grade Level</Label>
                <select id="grade" name="grade" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                  <option value="">Select your grade</option>
                  <option value="1">1st Grade</option>
                  <option value="2">2nd Grade</option>
                  <option value="3">3rd Grade</option>
                  <option value="4">4th Grade</option>
                  <option value="5">5th Grade</option>
                  <option value="6">6th Grade</option>
                  <option value="7">7th Grade</option>
                  <option value="8">8th Grade</option>
                  <option value="9">9th Grade</option>
                  <option value="10">10th Grade</option>
                  <option value="11">11th Grade</option>
                  <option value="12">12th Grade</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="subject" className="text-gray-900 font-medium">Subject for Tutoring</Label>
                <select id="subject" name="subject" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                  <option value="">Select a subject</option>
                  <option value="mathematics">Mathematics</option>
                  <option value="science">Science</option>
                  <option value="english">English & Literature</option>
                  <option value="history">History & Social Studies</option>
                  <option value="test-prep">Test Preparation</option>
                  <option value="computer-science">Computer Science</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="specific-topic" className="text-gray-900 font-medium">Specific Topic or Area of Focus</Label>
                <Input id="specific-topic" name="specific_topic" type="text" className="mt-2" placeholder="e.g., Algebra II, AP Physics, SAT Math (focus area for your child)" />
              </div>
              
              <div>
                <Label htmlFor="preferred-tutor" className="text-gray-900 font-medium">Preferred Tutor for Your Child (Optional)</Label>
                <select id="preferred-tutor" name="preferred_tutor" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                  <option value="">No preference</option>
                  <option value="joshua-wu">Joshua Wu</option>
                  <option value="sanjit-konda">Sanjit Konda</option>
                  <option value="james-chen">James Chen</option>
                  <option value="joshua-gan">Joshua Gan</option>
                  <option value="skanda-gopikannan">Skanda Gopikannan</option>
                  <option value="matthew-xie">Matthew Xie</option>
                  <option value="jennifer-duan">Jennifer Duan</option>
                  <option value="enoch-chan">Enoch Chan</option>
                  <option value="ishaan-nirmal">Ishaan Nirmal</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="session-type" className="text-gray-900 font-medium">Preferred Session Type</Label>
                <select id="session-type" name="session_type" className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                  <option value="">Select session type</option>
                  <option value="in-person">In-person (Plano area)</option>
                  <option value="online">Online (Zoom/Google Meet)</option>
                </select>
              </div>
              
              <div>
                <Label htmlFor="preferred-times" className="text-gray-900 font-medium">Preferred Times</Label>
                <textarea id="preferred-times" name="preferred_times" rows={3} className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g., Weekdays after 4 PM, Saturday mornings — times your child is available"></textarea>
              </div>

              {status !== 'idle' && (
                <div className={
                  status === 'loading' ? 'text-gray-600' : status === 'success' ? 'text-green-700' : 'text-red-700'
                }>
                  {status === 'loading' ? 'Submitting…' : message}
                </div>
              )}
              
              <div className="pt-6">
                <Button type="submit" className="w-full bg-gray-900 text-white hover:bg-gray-800 py-4 text-lg rounded-lg transition-all duration-300 font-medium">
                  Submit Booking Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-light text-gray-900 mb-6 animate-fade-in-up font-display">
              What Happens Next?
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center animate-fade-in-up">
              <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-medium">1</span>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-3 font-display">Submit Request</h3>
              <p className="text-gray-600 font-light">
                Fill out the form above with your child’s details and your contact information
              </p>
            </div>
            
            <div className="text-center animate-fade-in-up animation-delay-200">
              <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-medium">2</span>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-3 font-display">We&apos;ll Contact You</h3>
              <p className="text-gray-600 font-light">
                Within 24 hours, we&apos;ll reach out to you to confirm details and schedule
              </p>
            </div>
            
            <div className="text-center animate-fade-in-up animation-delay-400">
              <div className="w-12 h-12 bg-gray-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-white font-medium">3</span>
              </div>
              <h3 className="text-xl font-medium text-gray-900 mb-3 font-display">Start Learning</h3>
              <p className="text-gray-600 font-light">
                Your child meets with their tutor and begins learning
              </p>
            </div>
          </div>
        </div>
      </section>


      <Footer />
    </main>
  )
} 
