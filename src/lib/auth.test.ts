import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearSession,
    createSession,
    hashPassword,
    requireApiSession,
    SESSION_COOKIE_NAME,
    sessionCookie,
    verifyPassword,
    verifySession,
} from './auth.ts';

const password = 'correct horse battery staple';
const sessionSecret = 'test-session-secret-with-at-least-32-bytes';
const now = new Date('2026-08-11T12:00:00.000Z');
const passwordHash = await hashPassword(password, Buffer.from('0123456789abcdef'));

process.env.SESSION_SECRET = sessionSecret;

test('正确密码可以登录并创建可验证的 session', async () => {
    assert.equal(await verifyPassword(password, passwordHash), true);
    const token = createSession({ secret: sessionSecret, now });
    assert.equal(verifySession(token, { secret: sessionSecret, now }), true);
});

test('错误密码不能登录', async () => {
    assert.equal(await verifyPassword('wrong password', passwordHash), false);
});

test('session 可正确验证且 cookie 不包含密码', () => {
    const token = createSession({ secret: sessionSecret, now });
    assert.equal(verifySession(token, { secret: sessionSecret, now }), true);
    const cookie = sessionCookie(token);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /Max-Age=2592000/);
    assert.equal(cookie.includes(password), false);
});

test('被修改的 session 拒绝', () => {
    const token = createSession({ secret: sessionSecret, now });
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    assert.equal(verifySession(tampered, { secret: sessionSecret, now }), false);
});

test('过期 session 拒绝', () => {
    const token = createSession({ secret: sessionSecret, now, maxAgeSeconds: 60 });
    const later = new Date(now.getTime() + 61_000);
    assert.equal(verifySession(token, { secret: sessionSecret, now: later }), false);
});

test('未登录访问 Fuel API 返回 401', async () => {
    const response = await requireApiSession(new Request('https://fuel.example/api/fuel?vehicleId=one'));
    assert.equal(response?.status, 401);
});

test('未登录访问 Backup GET 返回 401', async () => {
    const response = await requireApiSession(new Request('https://fuel.example/api/backup'));
    assert.equal(response?.status, 401);
});

test('未登录访问 Backup POST 返回 401', async () => {
    const response = await requireApiSession(new Request('https://fuel.example/api/backup', { method: 'POST' }));
    assert.equal(response?.status, 401);
});

test('已登录时正常通过原有 API 的认证层', async () => {
    const token = createSession({ secret: sessionSecret });
    const request = new Request('https://fuel.example/api/fuel?vehicleId=one', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });
    assert.equal(await requireApiSession(request), null);
});

test('logout 清除 cookie 后 session 无效', async () => {
    const token = createSession({ secret: sessionSecret });
    assert.equal(verifySession(token, { secret: sessionSecret }), true);
    assert.match(clearSession(), new RegExp(`^${SESSION_COOKIE_NAME}=;.*Max-Age=0`));
    const response = await requireApiSession(new Request('https://fuel.example/api/fuel'));
    assert.equal(response?.status, 401);
});
