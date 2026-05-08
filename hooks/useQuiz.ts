'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  QuizQuestion,
  QuizState,
  calculateStats,
  saveQuizProgress,
  loadQuizProgress,
  clearQuizProgress,
} from '@/lib/quizData';

export interface UseQuizReturn {
  questions: QuizQuestion[];
  availableTopics: string[];
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

export function useQuiz(
  quizPath: string,
  classType: string,
  selectedTopics: string[] = [],
): UseQuizReturn {
  const [allQuestions, setAllQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  // Load CSV and restore progress
  useEffect(() => {
    async function loadQuiz() {
      try {
        const response = await fetch(quizPath, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load quiz: ${response.status}`);
        }
        const parsedQuestions = (await response.json()) as QuizQuestion[];

        if (!parsedQuestions.length) {
          throw new Error('No questions found in quiz file');
        }

        setAllQuestions(parsedQuestions);

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
  }, [quizPath, classType]);

  const filteredQuestions =
    selectedTopics.length === 0
      ? allQuestions
      : allQuestions.filter((question) => question.topic && selectedTopics.includes(question.topic));

  const availableTopics = Array.from(
    new Set(
      allQuestions
        .map((question) => question.topic)
        .filter((topic): topic is string => Boolean(topic)),
    ),
  ).sort((a, b) => a.localeCompare(b));

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
    setCurrentIndex((prev) =>
      filteredQuestions.length === 0 ? 0 : Math.min(prev + 1, filteredQuestions.length - 1),
    );
  }, [filteredQuestions.length]);

  const prevQuestion = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToQuestion = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, filteredQuestions.length - 1)));
  }, [filteredQuestions.length]);

  const randomQuestion = useCallback(() => {
    if (filteredQuestions.length <= 1) return;
    let nextIdx = currentIndex;
    while (nextIdx === currentIndex) {
      nextIdx = Math.floor(Math.random() * filteredQuestions.length);
    }
    setCurrentIndex(nextIdx);
  }, [filteredQuestions.length, currentIndex]);

  const resetProgress = useCallback(() => {
    setAnswers({});
    setCurrentIndex(0);
    clearQuizProgress(classType);
  }, [classType]);

  useEffect(() => {
    if (filteredQuestions.length === 0) {
      setCurrentIndex(0);
      return;
    }

    setCurrentIndex((prev) => Math.min(prev, filteredQuestions.length - 1));
  }, [filteredQuestions.length]);

  const stats = calculateStats(filteredQuestions, answers);

  return {
    questions: filteredQuestions,
    availableTopics,
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
