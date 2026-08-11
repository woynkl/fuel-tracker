import { NextResponse } from 'next/server';
import { clearSession, validateSameOrigin } from '@/lib/auth';

export async function POST(request: Request) {
    if (!validateSameOrigin(request)) {
        return NextResponse.json({ error: '不允许跨站退出请求' }, { status: 403 });
    }

    const response = NextResponse.json({ success: true });
    response.headers.set('Set-Cookie', clearSession());
    return response;
}
