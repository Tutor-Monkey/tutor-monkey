/**
 * AP Review Framework - Extensibility Guide
 * 
 * This file documents how to add new exam types/classes to the AP Review system.
 * The system is built to be extensible and supports multiple exam types with minimal effort.
 */

/**
 * STRUCTURE:
 * - Each exam type has its own route and data file
 * - CSV files are stored in /public (not /data) for client-side fetching
 * - Quiz state is saved per class type using localStorage
 */

/**
 * ADDING A NEW EXAM TYPE:
 * 
 * 1. Prepare CSV File
 *    - Place your CSV at /public/{class-key}_questions.csv
 *    - CSV columns should match this schema:
 *      question_number, url, question, question_image_urls, 
 *      choice_a, choice_a_image_urls, choice_b, choice_b_image_urls,
 *      choice_c, choice_c_image_urls, choice_d, choice_d_image_urls,
 *      choice_e, choice_e_image_urls,
 *      correct_answer, correct_choice_text, explanation, explanation_image_urls
 * 
 * 2. Create New Route
 *    - Create /app/{class-key}/page.tsx (e.g., ap-calculus)
 *    - Copy the template from APReviewPage and modify:
 *      a) CSV path: '/ap_calculus_questions.csv'
 *      b) Class type: 'ap-calculus'
 *      c) Page title and description
 *    - Paste this at the end of your page.tsx:
 * 
 *    ```typescript
 *    'use client';
 *    import React, { useState } from 'react';
 *    import { motion, AnimatePresence } from 'framer-motion';
 *    import Link from 'next/link';
 *    import Navigation from '@/components/Navigation';
 *    import Footer from '@/components/Footer';
 *    import QuizCard from '@/components/QuizCard';
 *    import QuizControls from '@/components/QuizControls';
 *    import { useQuiz } from '@/hooks/useQuiz';
 *    import { useIsClient } from '@/hooks/useIsClient';
 *    import { ChevronLeft } from 'lucide-react';
 *    
 *    export default function APCalcReviewPage() {
 *      const isClient = useIsClient();
 *      const [showFeedback, setShowFeedback] = useState(false);
 *      const quiz = useQuiz('/ap_calculus_questions.csv', 'ap-calculus');
 *    
 *      // ... rest of component (same structure as APReviewPage)
 *    }
 *    ```
 * 
 * 3. Update Navigation
 *    - Add link to /components/Navigation.tsx:
 *      <Link href="/ap-calculus" className="...">AP Calculus</Link>
 * 
 * 4. (Optional) Create Hub Page
 *    - Create /app/review/page.tsx to list all exam types
 *    - Users can discover and choose which exam to study
 */

/**
 * CLASS TYPE IDENTIFIERS:
 * - ap-statistics (existing)
 * - ap-calculus (recommended next)
 * - ap-biology
 * - ap-us-history
 * - ap-government
 * - [any other AP exam]
 */

/**
 * CONFIGURATION:
 * 
 * CSV Mapping (quizData.ts):
 * - Update the class type enum when adding new exam types:
 *   class: 'ap-statistics' | 'ap-calculus' | 'ap-biology' | ...
 * 
 * localStorage Keys:
 * - quiz-{classType} stores progress per exam
 * - Example: quiz-ap-calculus, quiz-ap-biology
 */

/**
 * CUSTOMIZATION OPTIONS:
 * 
 * 1. Branding
 *    - Update page title and description in each page.tsx
 *    - Customize colors using Tailwind gradients if needed
 * 
 * 2. Question Types
 *    - Current: Multiple choice (A-E)
 *    - To extend: Modify QuizQuestion interface and CSV parser
 * 
 * 3. Feedback
 *    - Each question can have: correct_choice_text + explanation
 *    - Both fields are optional
 * 
 * 4. Progress Tracking
 *    - Automatically saves to localStorage
 *    - Tests on page refresh restore to first unanswered question
 */

/**
 * DATA FORMAT REFERENCE:
 * 
 * CSV Example Row:
 * 1, https://example.com/q1, "What is 2+2?", 
 * "4", "", "5", "", "6", "", "5", "", "3", "",
 * A, "Correct, 2 + 2 = 4", "Basic arithmetic", ""
 * 
 * JSON Output:
 * {
 *   questionNumber: 1,
 *   class: 'ap-statistics',
 *   url: 'https://example.com/q1',
 *   questionText: 'What is 2+2?',
 *   choices: [
 *     { key: 'A', text: '4' },
 *     { key: 'B', text: '5' },
 *     { key: 'C', text: '6' },
 *     { key: 'D', text: '5' },
 *     { key: 'E', text: '3' }
 *   ],
 *   correctAnswer: 'A',
 *   correctChoiceText: 'Correct, 2 + 2 = 4',
 *   explanation: 'Basic arithmetic'
 * }
 */

/**
 * COMPONENTS USED:
 * - QuizCard: Displays question text, choices, and feedback
 * - QuizControls: Progress tracking, navigation, jump to question
 * - useQuiz Hook: State management for quiz progress
 * - quizData.ts: CSV parsing and utility functions
 */

export {};
