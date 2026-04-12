'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface QuizControlsProps {
  currentIndex: number;
  totalQuestions: number;
  correct: number;
  answered: number;
  onPrev: () => void;
  onNext: () => void;
  onRandom: () => void;
  onReset: () => void;
  onGoToQuestion: (index: number) => void;
}

export default function QuizControls({
  currentIndex,
  totalQuestions,
  onPrev,
  onNext,
  onGoToQuestion,
}: QuizControlsProps) {
  const [jumpValue, setJumpValue] = useState(String(currentIndex + 1));

  useEffect(() => {
    setJumpValue(String(currentIndex + 1));
  }, [currentIndex]);

  const handleJump = () => {
    const nextIndex = Math.min(Math.max(Number(jumpValue), 1), totalQuestions) - 1;
    onGoToQuestion(nextIndex);
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-gray-700 transition-colors"
      >
        <ChevronLeft size={16} />
        <span className="hidden sm:inline">Prev</span>
      </button>

      <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600">
        <input
          type="number"
          min={1}
          max={totalQuestions}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJump()}
          onBlur={handleJump}
          className="w-12 text-center text-gray-900 font-medium outline-none bg-transparent"
        />
        <span className="text-gray-400">/ {totalQuestions}</span>
      </div>

      <button
        onClick={onNext}
        disabled={currentIndex >= totalQuestions - 1}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-gray-700 transition-colors"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
