'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { QuizQuestion } from '@/lib/quizData';

interface QuizCardProps {
  question: QuizQuestion;
  selectedAnswer: string | undefined;
  onAnswerSelect: (answer: string) => void;
  showFeedback: boolean;
}

export default function QuizCard({
  question,
  selectedAnswer,
  onAnswerSelect,
  showFeedback,
}: QuizCardProps) {
  const isCorrect = selectedAnswer === question.correctAnswer;
  const answered = !!selectedAnswer;

  const imageTokenPattern = /\[Image:\s*([^\]]+)\]/gi;

  const renderTextWithImages = (
    text: string | undefined,
    imageUrls: string[] | undefined,
    altPrefix: string,
    textClassName: string,
  ) => {
    const sourceText = text?.trim() ?? '';
    const fallbackUrls = imageUrls ?? [];
    const usedUrls = new Set<string>();
    const content: React.ReactNode[] = [];
    let lastIndex = 0;
    let imageCount = 0;
    let match: RegExpExecArray | null;

    imageTokenPattern.lastIndex = 0;

    while ((match = imageTokenPattern.exec(sourceText)) !== null) {
      const [token, rawUrl] = match;
      const before = sourceText.slice(lastIndex, match.index);
      const imageUrl = rawUrl.trim();

      if (before) {
        content.push(
          <span key={`${altPrefix}-text-${lastIndex}`} className={textClassName}>
            {before}
          </span>,
        );
      }

      if (imageUrl) {
        usedUrls.add(imageUrl);
        imageCount += 1;
        content.push(
          <img
            key={`${altPrefix}-image-${match.index}`}
            src={imageUrl}
            alt={`${altPrefix} image ${imageCount}`}
            className="inline-block max-w-full h-auto align-middle my-1"
          />,
        );
      } else {
        content.push(
          <span key={`${altPrefix}-token-${match.index}`} className={textClassName}>
            {token}
          </span>,
        );
      }

      lastIndex = match.index + token.length;
    }

    const after = sourceText.slice(lastIndex);
    if (after) {
      content.push(
        <span key={`${altPrefix}-text-end`} className={textClassName}>
          {after}
        </span>,
      );
    }

    fallbackUrls
      .filter((url) => url && !usedUrls.has(url))
      .forEach((url, index) => {
        content.push(
          <img
            key={`${altPrefix}-fallback-${url}-${index}`}
            src={url}
            alt={`${altPrefix} image ${imageCount + index + 1}`}
            className="inline-block max-w-full h-auto align-middle my-1"
          />,
        );
      });

    if (content.length === 0) return null;

    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  };

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden grid lg:grid-cols-[3fr_2fr]">
      {/* Left: question — scrolls independently */}
      <div className="overflow-y-auto p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-full">
              Question {question.questionNumber}
            </span>
            {question.url && (
              <a
                href={question.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-400 hover:text-gray-700 underline transition-colors"
              >
                Source
              </a>
            )}
          </div>
          <span className="text-sm text-gray-400">
            {answered ? 'Answer selected' : 'Select the best answer'}
          </span>
        </div>

        <div className="text-base md:text-lg font-medium text-gray-900 leading-relaxed">
          {renderTextWithImages(
            question.questionText,
            question.questionImageUrls,
            `Question ${question.questionNumber}`,
            'text-inherit',
          )}
        </div>
      </div>

      {/* Right: answers — scrolls independently */}
      <div className="overflow-y-auto border-t border-gray-200 bg-gray-50 p-6 lg:border-t-0 lg:border-l">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-4">Choose one</p>

        <div className="space-y-2">
          {question.choices.map((choice) => {
            const isSelected = selectedAnswer === choice.key;
            const choiceIsCorrect = choice.key === question.correctAnswer;
            const highlightCorrect = answered && choiceIsCorrect;
            const highlightWrong = answered && isSelected && !choiceIsCorrect;

            return (
              <label
                key={choice.key}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-colors ${
                  highlightCorrect
                    ? 'border-green-400 bg-green-50'
                    : highlightWrong
                      ? 'border-red-400 bg-red-50'
                      : isSelected
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-gray-50'
                } ${answered ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="answer"
                  value={choice.key}
                  checked={isSelected}
                  onChange={() => onAnswerSelect(choice.key)}
                  disabled={answered}
                  className="mt-0.5 w-4 h-4 flex-shrink-0 accent-blue-600"
                />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className={`font-bold text-sm flex-shrink-0 ${
                        highlightCorrect ? 'text-green-700' : highlightWrong ? 'text-red-700' : 'text-gray-900'
                      }`}
                    >
                      {choice.key}.
                    </span>
                    <div className="text-sm text-gray-800 break-words">
                      {renderTextWithImages(
                        choice.text,
                        choice.imageUrls,
                        `Choice ${choice.key}`,
                        'text-inherit',
                      )}
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {showFeedback && selectedAnswer && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`mt-4 rounded-xl border p-4 text-sm leading-relaxed ${
              isCorrect
                ? 'border-green-300 bg-green-50 text-green-900'
                : 'border-red-300 bg-red-50 text-red-900'
            }`}
          >
            <p className="font-semibold mb-1">
              {isCorrect ? '✓ Correct!' : `✕ Incorrect — answer is ${question.correctAnswer}.`}
            </p>
            {question.correctChoiceText && (
              <div className="mb-2 text-gray-700">
                {renderTextWithImages(
                  question.correctChoiceText,
                  undefined,
                  'Correct choice',
                  'text-inherit',
                )}
              </div>
            )}
            {question.explanation && (
              <div className="text-gray-700">
                <p className="font-semibold mb-1">Explanation:</p>
                <div>
                  {renderTextWithImages(
                    question.explanation,
                    question.explanationImageUrls,
                    'Explanation',
                    'text-inherit',
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
