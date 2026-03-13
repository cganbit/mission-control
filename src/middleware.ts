import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (PUBLIC_PATHS.some(p => path.startsWith(p))) {
    return NextResponse.next();
  }

  // Skip static assets
  if (path.startsWith('/_next') || path.startsWith('/favicon')) {
    return NextResponse.next();
  }

  const token = req.cookies.get('mc_token')?.value
    ?? req.headers.get('authorization')?.replace('Bearer ', '');

  if (!token || !await verifyToken(token)) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
