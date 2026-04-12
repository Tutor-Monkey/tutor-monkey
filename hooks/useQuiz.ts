'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  QuizQuestion,
  QuizState,
  parseCsvText,
  calculateStats,
  saveQuizProgress,
  loadQuizProgress,
  clearQuizProgress,
} from '@/lib/quizData';

export interface UseQuizReturn {
  questions: QuizQuestion[];
  loading: boolean;
  error: string | null;
  answers: Record<number, string>;
  currentIndex: number;
  stats: ReturnType<typeof calculateStats>;
  saveAnswer: (questionNumber: number, answer: string) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  goToQuestion: (index: number) => void;
  randomQuestion: () => void;
  resetProgress: () => void;
}

export function useQuiz(csvPath: string, classType: string): UseQuizReturn {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Load CSV and restore progress
  useEffect(() => {
    async function loadQuiz() {
      try {
        const response = await fetch(csvPath);
        if (!response.ok) {
          throw new Error(`Failed to load quiz: ${response.status}`);
        }
        const csvText = await response.text();
        const parsedQuestions = parseCsvText(csvText);

        if (!parsedQuestions.length) {
          throw new Error('No questions found in quiz file');
        }

        setQuestions(parsedQuestions);

        // Restore progress
        const saved = loadQuizProgress(classType);
        if (saved) {
          setAnswers(saved.answers);
          // Go to first unanswered question
          const firstUnanswered = parsedQuestions.findIndex(
            (q) => !saved.answers[q.questionNumber],
          );
          setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setLoading(false);
      }
    }

    loadQuiz();
  }, [csvPath, classType]);

  const saveAnswer = useCallback(
    (questionNumber: number, answer: string) => {
      setAnswers((prev) => {
        const updated = { ...prev, [questionNumber]: answer };
        saveQuizProgress(classType, {
          answers: updated,
          completed: false,
          startTime: Date.now(),
        });
        return updated;
      });
    },
    [classType],
  );

  const nextQuestion = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }, [questions.length]);

  const prevQuestion = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToQuestion = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, questions.length - 1)));
  }, [questions.length]);

  const randomQuestion = useCallback(() => {
    if (questions.length <= 1) return;
    let nextIdx = currentIndex;
    while (nextIdx === currentIndex) {
      nextIdx = Math.floor(Math.random() * questions.length);
    }
    setCurrentIndex(nextIdx);
  }, [questions.length, currentIndex]);

  const resetProgress = useCallback(() => {
    setAnswers({});
    setCurrentIndex(0);
    clearQuizProgress(classType);
  }, [classType]);

  const stats = calculateStats(questions, answers);

  return {
    questions,
    loading,
    error,
    answers,
    currentIndex,
    stats,
    saveAnswer,
    nextQuestion,
    prevQuestion,
    goToQuestion,
    randomQuestion,
    resetProgress,
  };
}
