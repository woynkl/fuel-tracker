import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { AuthConfigurationError, SESSION_COOKIE_NAME, verifySession } from '@/lib/auth';

export function proxy(request: NextRequest) {
    try {
        const authenticated = verifySession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
        if (request.nextUrl.pathname === '/login') {
            return authenticated ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
        }
        return authenticated ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url));
    } catch (error) {
        if (error instanceof AuthConfigurationError) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        throw error;
    }
}

export const config = {
    matcher: ['/', '/login', '/vehicle/:path*', '/settings/:path*'],
};
