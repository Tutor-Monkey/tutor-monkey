# AP Review Quiz - UI Preview

## Page Layout

### Desktop (1920px+)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Navigation Bar (AP Review link added)                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ ← | AP Statistics Review                                            │
│     678 Practice Questions                                           │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────┬──────────────────────────┐
│                                          │ Your Progress            │
│ [Question Badge] [View Source]           │                          │
│                                          │ ┌──────────┬──────────┐  │
│ Question Title/Text                      │ │ 42 ✓     │ 58 •     │  │
│                                          │ │ Correct  │ Answered │  │
│ ○ A) Choice text here                   │ └──────────┴──────────┘  │
│ ○ B) Choice text here                   │                          │
│ ✓ C) Choice text here                   │ ┌────────────────────┐  │
│ ✕ D) Choice text here                   │ │       72%          │  │
│ ○ E) Choice text here                   │ │     Accuracy       │  │
│                                          │ └────────────────────┘  │
│ ┌─────────────────────────────────────┐ │                          │
│ │✓ Correct! The answer is C           │ │ Questions: 42 / 678  │  │
│ │                                     │ │ ▓▓▓▓▓▓░░░░░░░░░░░░  │  │
│ │Explanation text appears here...     │ │                          │
│ └─────────────────────────────────────┘ │ [← Previous] [Next →]   │
│                                          │ [🎲 Random Question]    │
│                                          │ [Reset Progress]        │
│                                          │                          │
│                                          │ Jump to Question:        │
│                                          │ [Q1] [Q2] [Q3] ...     │
│                                          │ ...and more             │
│                                          │                          │
└──────────────────────────────────────────┴──────────────────────────┘

Footer
```

### Mobile (375px)

```
┌────────────────────────────────────────┐
│ Navigation (AP Review in menu)         │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ ← AP Statistics Review                 │
│   678 Practice Questions               │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ [Q1] [View Source]                     │
│                                        │
│ Question Title/Text                    │
│                                        │
│ ○ A) Choice text                       │
│ ○ B) Choice text                       │
│ ✓ C) Choice text                       │
│ ✕ D) Choice text                       │
│ ○ E) Choice text                       │
│                                        │
│ Correct! The answer is C               │
│ Explanation text...                    │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Your Progress                          │
│ ┌──────────┬──────────┐                │
│ │ 42 ✓     │ 58 •     │                │
│ │ Correct  │ Answered │                │
│ └──────────┴──────────┘                │
│ ┌────────────────────┐                │
│ │       72%          │                │
│ │     Accuracy       │                │
│ └────────────────────┘                │
│ 42 / 678 Questions                    │
│ ▓▓▓▓▓▓░░░░░░░░░░░░                   │
│ [← Prev] [Next →]                    │
│ [🎲 Random]                          │
│ [Reset Progress]                     │
│ Jump: [Q1] [Q2] ... [Q20]            │
└────────────────────────────────────────┘

Footer
```

## Color Scheme

### Question Status

- **Gold/Amber Badge**: Question number (gradient from amber to orange)
- **Blue Radio**: Selected incorrect answer
- **Green Border**: Correct answer (with ✓)
- **Red Border**: Your incorrect selection (with ✕)
- **Muted**: Unselected options

### Feedback Panel

- **Green Background**: Correct answer feedback (green-500/10)
- **Red Background**: Incorrect answer feedback (red-500/10)
- **Green Text**: Correct label (text-green-400)
- **Red Text**: Incorrect label (text-red-400)

### Progress Stats

- **Blue Box**: Correct answers count
- **Amber Box**: Total answered questions
- **Gradient Box**: Accuracy percentage (blue → purple)

### Navigation

- **Primary Button**: Blue-to-purple gradient (Random, Jump buttons)
- **Secondary Button**: White/10 background (Previous, Next, Reset)
- **Hover State**: All buttons highlight on hover

## Animations

1. **Page Load**: Fade in + slide up (300ms)
2. **Question Change**:
   - Current fades out + slides left
   - New question fades in + slides right
   - Total duration: 300ms
3. **Feedback Appear**: Slide up from question (200ms delay)
4. **Progress Bar Fill**: Smooth width transition (500ms easing)
5. **Button Hover**: Opacity change (instant)
6. **Scale Effect**: Question card slightly scales on hover

## Interactive Elements

### Clickable

- Radio buttons (select answer)
- Previous/Next buttons (navigate)
- Random button (jump to random question)
- Reset button (clear progress)
- Question number buttons (in sidebar)
- Navigation links (back to home)
- Source link (opens in new tab)

### Disabled States

- Previous button: Disabled on first question
- Next button: Disabled on last question
- Radio buttons: Disabled once an answer is selected

## Typography

- **Heading (Page Title)**: 3xl/4xl, font-bold, white
- **Subtitle**: text-gray-400, regular weight
- **Question Text**: xl/2xl, font-semibold, white, leading-relaxed
- **Choices**: text-white, with letter in font-semibold
- **Feedback**: text-sm, text-gray-300
- **Stats Labels**: text-xs, text-gray-400

## Spacing

- **Container padding**: px-4/8 (sides), py-6/12 (vertical)
- **Card padding**: p-8
- **Gap between elements**: gap-6/8
- **Choice spacing**: space-y-3

## Borders & Shadows

- **Main cards**: border border-white/20, rounded-2xl
- **Control cards**: backdrop-blur-md
- **Question container**: bg-white/5 with border
- **Choice boxes**: rounded-xl, hover:border-white/40
- **Effect**: ring-1 ring-black/10 on navbar

---

**Visual Design Principles:**

- Dark, professional theme matching your site
- Glass morphism (blur + transparency)
- High contrast for readability
- Color-coded feedback (green/red)
- Smooth animations (not jarring)
- Responsive layout (adapts to screen size)
