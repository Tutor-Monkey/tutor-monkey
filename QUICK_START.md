# Quick Start - AP Review Quiz 🚀

## 1. Start Development Server

```bash
cd /Users/sanjitk./Desktop/Tutor\ Monkey/tutor-monkey
npm run dev
```

## 2. Visit the Quiz

Open: **http://localhost:3000/ap-review**

## 3. That's It! 🎉

The quiz loads all 678 questions automatically with:

- Beautiful dark UI with glass morphism
- Smooth animations
- Real-time feedback with explanations
- Progress tracking (saves automatically)
- Desktop & mobile responsive design

---

## What To Look For

✅ Questions display with 5 multiple choice options (A-E)
✅ Clicking an answer shows instant feedback (green = correct, red = incorrect)
✅ Explanation appears below feedback
✅ Progress bar shows completion percentage
✅ Score displays: correct answers + accuracy %
✅ Can navigate with Previous/Next buttons
✅ Random button jumps to random question
✅ Progress saves when you reload the page

---

## Adding More Exams (Later)

When ready to add AP Calculus, AP Biology, etc.:

1. Place CSV at `/public/ap_calculus_questions.csv`
2. Create `/app/ap-calculus/page.tsx` (copy template from file explorer)
3. Add link to Navigation component
4. Done! 🎓

See `README_QUIZ_SYSTEM.md` for details.

---

**Questions?** Check the comments in the code or review the setup guides!
