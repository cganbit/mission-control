import { NextResponse } from 'next/server';

// Auth is handled at the page and API route level.
// This proxy just passes all requests through.
export function proxy() {
  return NextResponse.next();
}
