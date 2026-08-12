import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import test, { after, before } from 'node:test';

const password = 'mobile-qa-password';
const passwordHash = 'scrypt:32768:8:1:MDEyMzQ1Njc4OWFiY2RlZg:2DRkJnDqH8ilaGhfWk0x54MDlXL2O62Wwg7Wt4ALysw';
const sessionSecret = 'integration-test-session-secret-at-least-32-bytes';

let app: ChildProcessWithoutNullStreams;
let origin: string;
let output = '';

async function availablePort() {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const port = address.port;
    server.close();
    await once(server, 'close');
    return port;
}

before(async () => {
    const port = await availablePort();
    origin = `http://127.0.0.1:${port}`;
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            APP_PASSWORD_HASH: passwordHash,
            SESSION_SECRET: sessionSecret,
            DATABASE_URL: 'file:./dev.db',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    app.stdout.on('data', chunk => { output += chunk.toString(); });
    app.stderr.on('data', chunk => { output += chunk.toString(); });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (app.exitCode !== null) throw new Error(`Next.js 测试服务启动失败：\n${output}`);
        try {
            const response = await fetch(`${origin}/login`);
            if (response.ok) return;
        } catch {
            // 服务仍在启动。
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`等待 Next.js 测试服务超时：\n${output}`);
});

after(async () => {
    if (!app || app.exitCode !== null) return;
    app.kill();
    await Promise.race([once(app, 'exit'), new Promise(resolve => setTimeout(resolve, 5_000))]);
});

test('真实认证 API 与受保护数据 API', async t => {
    await t.test('Health API 无需登录即可返回 200', async () => {
        const response = await fetch(`${origin}/api/health`);
        assert.equal(response.status, 200);
    });

    await t.test('Health API 只返回固定健康状态', async () => {
        const response = await fetch(`${origin}/api/health`);
        assert.deepEqual(await response.json(), { status: 'ok' });
    });

    await t.test('Health API 不泄露环境变量或内部数据', async () => {
        const response = await fetch(`${origin}/api/health`);
        const body = await response.text();
        assert.equal(body, '{"status":"ok"}');
        for (const sensitiveValue of [passwordHash, sessionSecret, 'file:./dev.db']) {
            assert.equal(body.includes(sensitiveValue), false);
        }
        for (const sensitiveKey of ['APP_PASSWORD_HASH', 'SESSION_SECRET', 'DATABASE_URL']) {
            assert.equal(body.includes(sensitiveKey), false);
        }
    });

    await t.test('错误密码不能登录', async () => {
        const response = await fetch(`${origin}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'wrong-password' }),
        });
        assert.equal(response.status, 401);
    });

    let cookie = '';
    await t.test('正确密码可以登录并设置安全 cookie', async () => {
        const response = await fetch(`${origin}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
        });
        assert.equal(response.status, 200);
        const setCookie = response.headers.get('set-cookie') ?? '';
        assert.match(setCookie, /^fuel_session=/);
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /SameSite=Lax/i);
        assert.match(setCookie, /Path=\//i);
        assert.match(setCookie, /Max-Age=2592000/i);
        cookie = setCookie.split(';', 1)[0];
    });

    await t.test('未登录访问 Fuel API 返回 401', async () => {
        const response = await fetch(`${origin}/api/fuel?vehicleId=vehicle-1`);
        assert.equal(response.status, 401);
    });

    await t.test('未登录访问 Backup GET 返回 401', async () => {
        const response = await fetch(`${origin}/api/backup`);
        assert.equal(response.status, 401);
    });

    await t.test('未登录访问 Backup POST 返回 401', async () => {
        const response = await fetch(`${origin}/api/backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
        assert.equal(response.status, 401);
    });

    await t.test('已登录时正常通过原有 Fuel API', async () => {
        const response = await fetch(`${origin}/api/fuel`, { headers: { cookie } });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: 'Vehicle ID required' });
    });

    await t.test('logout 清除 session cookie', async () => {
        const response = await fetch(`${origin}/api/auth/logout`, {
            method: 'POST',
            headers: { cookie },
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie') ?? '', /^fuel_session=;.*Max-Age=0/i);
        const afterLogout = await fetch(`${origin}/api/fuel`);
        assert.equal(afterLogout.status, 401);
    });
});
