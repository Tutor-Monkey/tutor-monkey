import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { parseCsvText } from '@/lib/quizData';

const QUIZ_FILES: Record<string, string> = {
  'ap-statistics': 'ap_statistics_questions.csv',
  'ap-calculus-bc': 'ap_calculus_bc_questions.csv',
  'ap-computer-science-a': 'ap_computer_science_a_questions.csv',
  'ap-physics-1': 'ap_physics_1_questions.csv',
};

export async function GET(
  _request: Request,
  { params }: { params: { quizId: string } },
) {
  const fileName = QUIZ_FILES[params.quizId];

  if (!fileName) {
    return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'quizzes', fileName);
    const csvText = await fs.readFile(filePath, 'utf8');
    const questions = parseCsvText(csvText, params.quizId);

    return NextResponse.json(questions, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(`Failed to load quiz ${params.quizId}:`, error);
    return NextResponse.json({ error: 'Failed to load quiz' }, { status: 500 });
  }
}
