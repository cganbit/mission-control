import { NextRequest, NextResponse } from 'next/server';
import { signToken, ADMIN_PASSWORD } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 });
  }

  const token = await signToken({ role: 'admin' });

  const res = NextResponse.json({ ok: true });
  res.cookies.set('mc_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  return res;
}
