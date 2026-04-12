'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import QuizCard from '@/components/QuizCard';
import QuizControls from '@/components/QuizControls';
import { useQuiz } from '@/hooks/useQuiz';
import { useIsClient } from '@/hooks/useIsClient';
import { ChevronLeft } from 'lucide-react';

interface ReviewOption {
  id: string;
  title: string;
  description: string;
  subtitle: string;
  csvPath: string;
  questionCount: number;
}

const reviewOptions: ReviewOption[] = [
  {
    id: 'ap-statistics',
    title: 'AP Statistics',
    description: '678 practice questions',
    subtitle: 'Practice AP Statistics with detailed explanations and progress tracking.',
    csvPath: '/ap_statistics_questions.csv',
    questionCount: 678,
  },
  {
    id: 'ap-calculus-bc',
    title: 'AP Calculus BC',
    description: '405 practice questions',
    subtitle: 'Practice AP Calculus BC with detailed explanations and progress tracking.',
    csvPath: '/ap_calculus_bc_questions.csv',
    questionCount: 405,
  },
  {
    id: 'ap-computer-science-a',
    title: 'AP Computer Science A',
    description: '334 practice questions',
    subtitle: 'Practice AP Computer Science A with detailed explanations and progress tracking.',
    csvPath: '/ap_computer_science_a_questions.csv',
    questionCount: 334,
  },
  {
    id: 'ap-physics-1',
    title: 'AP Physics 1',
    description: '462 practice questions',
    subtitle: 'Practice AP Physics 1 with detailed explanations and progress tracking.',
    csvPath: '/ap_physics_1_questions.csv',
    questionCount: 462,
  },
];

function APReviewQuiz({ review, onBack }: { review: ReviewOption; onBack: () => void }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const quiz = useQuiz(review.csvPath, review.id);

  if (quiz.loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-gray-800 animate-spin" />
          <p className="text-gray-500 text-sm">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (quiz.error) {
    return (
      <div className="flex h-screen items-center justify-center bg-white px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-red-700 font-semibold mb-2">{quiz.error}</p>
          <p className="text-gray-500 text-sm">Please make sure the quiz file is properly loaded.</p>
        </div>
      </div>
    );
  }

  const currentQuestion = quiz.questions[quiz.currentIndex];
  const selectedAnswer = quiz.answers[currentQuestion?.questionNumber];
  const percentage =
    quiz.stats.answered > 0
      ? Math.round((quiz.stats.correct / quiz.stats.answered) * 100)
      : 0;

  return (
    <div className="flex flex-col h-dvh bg-white text-gray-900">
      {/* Sticky header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>

            <div className="flex-shrink-0">
              <h1 className="text-base font-semibold text-gray-900">{review.title}</h1>
              <p className="text-xs text-gray-400">{review.questionCount} questions</p>
            </div>

            {/* Progress bar */}
            <div className="flex-1 min-w-36">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                <span>Progress</span>
                <span>{quiz.stats.answered} / {quiz.questions.length}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(quiz.stats.answered / quiz.questions.length) * 100}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="h-full rounded-full bg-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
              <div className="text-right">
                <p className="text-xs text-gray-400">Accuracy</p>
                <p className="text-lg font-bold text-gray-900">{percentage}%</p>
              </div>
              <button
                onClick={() => { quiz.resetProgress(); setShowFeedback(false); }}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Full-height card area — min-h-0 lets flex-1 shrink correctly */}
      <main className="flex-1 min-h-0 px-4 sm:px-6 py-4">
        <div className="h-full max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={`q-${currentQuestion.questionNumber}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {quiz.stats.answered === quiz.questions.length ? (
                <div className="h-full flex items-center justify-center">
                  <div className="rounded-2xl border border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-10 text-center max-w-md w-full">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Quiz Complete!</h2>
                    <p className="text-gray-500 mb-6 text-sm">You answered all {quiz.questions.length} questions.</p>
                    <button
                      onClick={() => { quiz.resetProgress(); setShowFeedback(false); }}
                      className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Start Over
                    </button>
                  </div>
                </div>
              ) : (
                <QuizCard
                  question={currentQuestion}
                  selectedAnswer={selectedAnswer}
                  onAnswerSelect={(answer) => {
                    quiz.saveAnswer(currentQuestion.questionNumber, answer);
                    setShowFeedback(true);
                  }}
                  showFeedback={showFeedback && !!selectedAnswer}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Sticky footer nav */}
      <footer className="flex-shrink-0 border-t border-gray-200 bg-white px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <span className="text-xs text-gray-400 hidden sm:block">
            Q{quiz.currentIndex + 1} of {quiz.questions.length}
          </span>
          <QuizControls
            currentIndex={quiz.currentIndex}
            totalQuestions={quiz.questions.length}
            correct={quiz.stats.correct}
            answered={quiz.stats.answered}
            onPrev={quiz.prevQuestion}
            onNext={quiz.nextQuestion}
            onRandom={quiz.randomQuestion}
            onReset={() => { quiz.resetProgress(); setShowFeedback(false); }}
            onGoToQuestion={quiz.goToQuestion}
          />
          <span className="text-xs text-gray-400 hidden sm:block">
            {quiz.stats.correct} correct
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function APReviewPage() {
  const isClient = useIsClient();
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const activeReview = reviewOptions.find((review) => review.id === selectedReview) ?? null;

  if (!isClient) return <main className="min-h-screen bg-white opacity-0" />;

  if (activeReview) {
    return <APReviewQuiz review={activeReview} onBack={() => setSelectedReview(null)} />;
  }

  return (
    <main style={{ backgroundColor: 'var(--bgMain)', color: 'var(--textDark)' }} className="min-h-screen">
      <Navigation />
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-28">
        <div className="rounded-2xl border border-gray-200 bg-white px-6 sm:px-10 py-10 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">AP Reviews</p>
          <h1 className="text-3xl font-light text-gray-900 mb-3 font-display">Choose a review to begin</h1>
          <p className="text-gray-500 mb-8">
            Select the AP review you want to study, and start practicing with hundreds of questions and detailed explanations.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {reviewOptions.map((review) => (
              <button
                key={review.id}
                type="button"
                onClick={() => setSelectedReview(review.id)}
                className="group rounded-2xl border border-gray-200 bg-white p-6 text-left hover:border-blue-400 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">{review.title}</h2>
                  <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white flex-shrink-0">
                    Available
                  </span>
                </div>
                <p className="text-sm text-gray-400 mb-1">{review.description}</p>
                <p className="text-sm text-gray-600">{review.subtitle}</p>
              </button>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5">
            <p className="text-sm font-medium text-gray-700">More AP reviews coming soon</p>
            <p className="text-sm text-gray-400 mt-1">AP Biology and other exams are on the way.</p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
