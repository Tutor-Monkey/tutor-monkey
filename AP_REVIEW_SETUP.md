# AP Review Quiz System - Setup Guide

## Overview

This is a professional quiz system for AP Statistics (and other exam types). It loads questions from CSV files and provides an interactive learning experience with progress tracking.

## What Was Added

### Components

- **QuizCard** (`/components/QuizCard.tsx`) - Displays questions, choices, and feedback
- **QuizControls** (`/components/QuizControls.tsx`) - Navigation, progress tracking, and question jumping

### Hooks

- **useQuiz** (`/hooks/useQuiz.ts`) - Manages quiz state, progress, and localStorage

### Utilities

- **quizData.ts** (`/lib/quizData.ts`) - CSV parsing, state management, and calculations
- **QUIZ_FRAMEWORK.ts** (`/lib/QUIZ_FRAMEWORK.ts`) - Extensibility guide for adding new exams

### Pages

- **AP Review** (`/app/ap-review/page.tsx`) - Main quiz interface

### Navigation Updates

- Added "AP Review" link to Navigation component

## Setup Steps

### 1. Move CSV to Public Folder

The CSV file needs to be accessible to the browser. Move it from `/data/` to `/public/`:

```bash
# Make sure public folder exists
mkdir -p public

# Move the CSV file
mv data/ap_statistics_questions.csv public/
```

### 2. Verify File Location

The file should now be at:

```
/public/ap_statistics_questions.csv
```

### 3. Test the Quiz

Navigate to `http://localhost:3000/ap-review` to see the quiz in action.

## Features

### For Users

- ✅ **678 Practice Questions** from AP Statistics
- ✅ **Progress Tracking** - Saves answers automatically to localStorage
- ✅ **Instant Feedback** - Correct/incorrect indication with explanations
- ✅ **Navigation Controls** - Previous/Next, Jump to Question, Random
- ✅ **Score Display** - Shows correct answers and accuracy percentage
- ✅ **Responsive Design** - Works on desktop and mobile

### Developer Features

- ✅ **Extensible Framework** - Easy to add AP Calculus, Biology, etc.
- ✅ **CSV Parser** - Handles quoted fields and image URLs
- ✅ **Modular Components** - Reusable across exam types
- ✅ **localStorage Integration** - Automatic progress save/restore

## How to Add More Exam Types

See `/lib/QUIZ_FRAMEWORK.ts` for detailed instructions. Quick summary:

1. **Prepare CSV** - Place new exam CSV at `/public/ap-calculus_questions.csv`
2. **Create Route** - Create `/app/ap-calculus/page.tsx` (see template in QUIZ_FRAMEWORK.ts)
3. **Update Navigation** - Add link to new page in Navigation component
4. **Done!** - The system handles everything else

## Architecture

```
User sees question
         ↓
QuizCard renders with choices
         ↓
User selects answer
         ↓
useQuiz.saveAnswer() called
         ↓
Answer saved to localStorage via saveQuizProgress()
         ↓
Feedback shown (correct/incorrect + explanation)
         ↓
QuizControls enable navigation to next question
```

## Styling

- Uses **Tailwind CSS** for styling
- Matches existing website design (dark theme, glass morphism)
- Uses **Framer Motion** for smooth animations
- Responsive grid layout: 2 columns on desktop, 1 on mobile

## Data Storage

Quiz progress is stored in localStorage under key: `quiz-{classType}`
Example: `quiz-ap-statistics`, `quiz-ap-calculus`

Each entry contains:

```json
{
  "answers": {
    "1": "C",
    "2": "B",
    "5": "D"
  },
  "completed": false,
  "startTime": 1234567890
}
```

## Customization

You can easily customize:

- Colors/gradients in component className props
- Question display format in QuizCard
- Progress bar appearance in QuizControls
- Page title and description in /app/ap-review/page.tsx

## Performance Notes

- **678 questions** loads instantly (CSV parsing happens client-side)
- Progress is saved per question (minimal overhead)
- Images in questions load lazily (if you add them later)

## Extensible Class Types

The system supports any class type. Update the type in `quizData.ts`:

```typescript
class: 'ap-statistics' | 'ap-calculus' | 'ap-biology' | 'ap-us-history' | string;
```

## Browser Compatibility

Works in all modern browsers (Chrome, Firefox, Safari, Edge).
Requires localStorage support (available in all modern browsers).

---

**Questions?** Check the code comments or QUIZ_FRAMEWORK.ts for implementation details.
