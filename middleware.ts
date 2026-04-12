import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  createQuizAccessToken,
  getQuizAccessCookieName,
  getQuizAccessMaxAge,
} from '@/lib/quizAccess';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const token = await createQuizAccessToken();

  if (!token) {
    return response;
  }

  response.cookies.set({
    name: getQuizAccessCookieName(),
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getQuizAccessMaxAge(),
  });

  return response;
}

export const config = {
  matcher: ['/ap-review/:path*'],
};
