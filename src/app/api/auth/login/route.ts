import { NextResponse } from 'next/server';
import {
    AuthConfigurationError,
    createSession,
    isJsonRequest,
    sessionCookie,
    validateSameOrigin,
    verifyPassword,
} from '@/lib/auth';

export async function POST(request: Request) {
    if (!validateSameOrigin(request)) {
        return NextResponse.json({ error: '不允许跨站登录请求' }, { status: 403 });
    }
    if (!isJsonRequest(request)) {
        return NextResponse.json({ error: 'Content-Type 必须是 application/json' }, { status: 415 });
    }

    try {
        const body: unknown = await request.json();
        const password = typeof body === 'object' && body !== null && 'password' in body
            ? (body as { password?: unknown }).password
            : undefined;
        if (typeof password !== 'string' || !(await verifyPassword(password))) {
            return NextResponse.json({ error: '密码错误' }, { status: 401 });
        }

        const response = NextResponse.json({ success: true });
        response.headers.set('Set-Cookie', sessionCookie(createSession()));
        return response;
    } catch (error) {
        if (error instanceof AuthConfigurationError) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ error: '登录请求格式无效' }, { status: 400 });
    }
}
