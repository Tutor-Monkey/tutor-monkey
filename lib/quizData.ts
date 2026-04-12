/**
 * Quiz Data Management
 * Handles loading and parsing quiz questions from CSV files
 * Extensible framework for multiple exam types
 */

export interface QuizChoice {
  key: string;
  text: string;
  imageUrls?: string[];
}

export interface QuizQuestion {
  questionNumber: number;
  class: 'ap-statistics' | 'ap-calculus' | 'ap-biology' | string;
  url?: string;
  questionText: string;
  questionImageUrls?: string[];
  choices: QuizChoice[];
  correctAnswer: string;
  correctChoiceText?: string;
  explanation?: string;
  explanationImageUrls?: string[];
}

export interface QuizState {
  answers: Record<number, string>;
  completed: boolean;
  startTime: number;
  endTime?: number;
}

/**
 * Parse CSV text into an array of question objects
 * Properly handles quoted fields with newlines
 */
export function parseCsvText(csvText: string, className: QuizQuestion['class'] = 'ap-statistics'): QuizQuestion[] {
  const lines = parseCSVRows(csvText);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const questions: QuizQuestion[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 5) continue;

    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });

    const question = normalizeQuestion(record, className);
    if (question) {
      questions.push(question);
    }
  }

  return questions;
}

/**
 * Parse CSV text into rows, properly handling quoted fields with newlines
 */
function parseCSVRows(csvText: string): string[] {
  const rows: string[] = [];
  let currentRow = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      currentRow += char;
      // Check for escaped quote
      if (nextChar === '"') {
        currentRow += nextChar;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' && !inQuotes) {
      // End of row
      if (currentRow.trim()) {
        rows.push(currentRow);
      }
      currentRow = '';
    } else {
      currentRow += char;
    }
  }

  // Add the last row if it exists
  if (currentRow.trim()) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Normalize a CSV record into a QuizQuestion object
 */
function normalizeQuestion(
  record: Record<string, string>,
  className: QuizQuestion['class'],
): QuizQuestion | null {
  const questionNumber = parseInt(record['question_number'] || '', 10);
  if (!questionNumber || isNaN(questionNumber)) return null;

  const choiceKeys = ['A', 'B', 'C', 'D', 'E'];
  const choices: QuizChoice[] = [];

  choiceKeys.forEach((key) => {
    const text = record[`choice_${key.toLowerCase()}`]?.trim();
    const imageUrls = parseImageUrls(record[`choice_${key.toLowerCase()}_image_urls`] || '');
    if (text) {
      choices.push({ key, text, imageUrls });
    }
  });

  if (choices.length === 0) return null;

  return {
    questionNumber,
    class: className,
    url: record['url'] || undefined,
    questionText: record['question'] || '',
    questionImageUrls: parseImageUrls(record['question_image_urls'] || ''),
    choices,
    correctAnswer: (record['correct_answer'] || '').trim().toUpperCase(),
    correctChoiceText: record['correct_choice_text'] || undefined,
    explanation: record['explanation'] || undefined,
    explanationImageUrls: parseImageUrls(record['explanation_image_urls'] || ''),
  };
}

function parseImageUrls(value: string): string[] {
  return value
    .split(/\s*[,;|]\s*/)
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

/**
 * Calculate quiz statistics
 */
export function calculateStats(
  questions: QuizQuestion[],
  answers: Record<number, string>,
) {
  const answered = Object.keys(answers).length;
  const correct = questions.filter(
    (q) => answers[q.questionNumber] === q.correctAnswer,
  ).length;
  const percentage = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  return {
    answered,
    correct,
    total: questions.length,
    percentage,
    remaining: questions.length - answered,
  };
}

/**
 * Save quiz progress to localStorage
 */
export function saveQuizProgress(classType: string, quizState: QuizState) {
  try {
    localStorage.setItem(`quiz-${classType}`, JSON.stringify(quizState));
  } catch (error) {
    console.error('Failed to save quiz progress:', error);
  }
}

/**
 * Load quiz progress from localStorage
 */
export function loadQuizProgress(classType: string): QuizState | null {
  try {
    const saved = localStorage.getItem(`quiz-${classType}`);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('Failed to load quiz progress:', error);
    return null;
  }
}

/**
 * Clear quiz progress from localStorage
 */
export function clearQuizProgress(classType: string) {
  try {
    localStorage.removeItem(`quiz-${classType}`);
  } catch (error) {
    console.error('Failed to clear quiz progress:', error);
  }
}
