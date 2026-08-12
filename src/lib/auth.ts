import {
    createHmac,
    randomBytes,
    scrypt as nodeScrypt,
    timingSafeEqual,
    type ScryptOptions,
} from 'node:crypto';

export const SESSION_COOKIE_NAME = 'fuel_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const DEFAULT_SCRYPT_COST = 32_768;
const DEFAULT_SCRYPT_BLOCK_SIZE = 8;
const DEFAULT_SCRYPT_PARALLELIZATION = 1;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
    return new Promise<Buffer>((resolve, reject) => {
        nodeScrypt(password, salt, keyLength, options, (error, derivedKey) => {
            if (error) reject(error);
            else resolve(derivedKey);
        });
    });
}

type SessionOptions = {
    secret?: string;
    now?: Date;
    maxAgeSeconds?: number;
};

export class AuthConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthConfigurationError';
    }
}

function requiredEnvironment(variable: 'APP_PASSWORD_HASH' | 'SESSION_SECRET') {
    const value = process.env[variable];
    if (!value) {
        throw new AuthConfigurationError(`缺少必需环境变量 ${variable}，请先配置后再启动认证。`);
    }
    if (variable === 'SESSION_SECRET' && Buffer.byteLength(value, 'utf8') < 32) {
        throw new AuthConfigurationError('SESSION_SECRET 至少需要 32 字节，请使用 npm run auth:generate 重新生成。');
    }
    return value;
}

function encode(value: Buffer | string) {
    return Buffer.from(value).toString('base64url');
}

function safeEqual(left: Buffer, right: Buffer) {
    return left.length === right.length && timingSafeEqual(left, right);
}

export async function hashPassword(password: string, salt = randomBytes(16)) {
    const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
        N: DEFAULT_SCRYPT_COST,
        r: DEFAULT_SCRYPT_BLOCK_SIZE,
        p: DEFAULT_SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY,
    });

    return [
        'scrypt',
        DEFAULT_SCRYPT_COST,
        DEFAULT_SCRYPT_BLOCK_SIZE,
        DEFAULT_SCRYPT_PARALLELIZATION,
        encode(salt),
        encode(derived),
    ].join(':');
}

export async function verifyPassword(password: string, encodedHash?: string) {
    if (Buffer.byteLength(password, 'utf8') > 1024) return false;
    const storedHash = encodedHash ?? requiredEnvironment('APP_PASSWORD_HASH');
    const [algorithm, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue, extra] = storedHash.split(':');
    if (algorithm !== 'scrypt' || !costValue || !blockSizeValue || !parallelizationValue || !saltValue || !hashValue || extra) {
        return false;
    }

    const cost = Number(costValue);
    const blockSize = Number(blockSizeValue);
    const parallelization = Number(parallelizationValue);
    if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelization)) return false;
    if (cost < 16_384 || cost > 1_048_576 || blockSize < 1 || blockSize > 32 || parallelization < 1 || parallelization > 16) return false;

    try {
        const salt = Buffer.from(saltValue, 'base64url');
        const expected = Buffer.from(hashValue, 'base64url');
        if (salt.length < 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;

        const actual = await scrypt(password, salt, expected.length, {
            N: cost,
            r: blockSize,
            p: parallelization,
            maxmem: Math.max(SCRYPT_MAX_MEMORY, 128 * cost * blockSize + 1024),
        });
        return safeEqual(actual, expected);
    } catch {
        return false;
    }
}

function sign(payload: string, secret: string) {
    return createHmac('sha256', secret).update(payload).digest();
}

export function createSession(options: SessionOptions = {}) {
    const secret = options.secret ?? requiredEnvironment('SESSION_SECRET');
    const now = options.now ?? new Date();
    const maxAgeSeconds = options.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
    const payload = encode(JSON.stringify({
        v: 1,
        iat: Math.floor(now.getTime() / 1000),
        exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
        nonce: randomBytes(16).toString('base64url'),
    }));
    return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

export function verifySession(token: string | undefined, options: SessionOptions = {}) {
    const secret = options.secret ?? requiredEnvironment('SESSION_SECRET');
    if (!token) return false;
    const [payload, signatureValue, extra] = token.split('.');
    if (!payload || !signatureValue || extra) return false;
    if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signatureValue)) return false;

    try {
        const actualSignature = Buffer.from(signatureValue, 'base64url');
        if (encode(actualSignature) !== signatureValue) return false;
        if (!safeEqual(actualSignature, sign(payload, secret))) return false;

        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
            v?: unknown;
            iat?: unknown;
            exp?: unknown;
        };
        const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
        return session.v === 1
            && typeof session.iat === 'number'
            && typeof session.exp === 'number'
            && session.iat <= nowSeconds
            && session.exp > nowSeconds;
    } catch {
        return false;
    }
}

function readCookie(cookieHeader: string | null, name: string) {
    if (!cookieHeader) return undefined;
    for (const cookie of cookieHeader.split(';')) {
        const separator = cookie.indexOf('=');
        if (separator === -1) continue;
        if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
    }
    return undefined;
}

export async function requireSession(request?: Request) {
    const token = request
        ? readCookie(request.headers.get('cookie'), SESSION_COOKIE_NAME)
        : (await import('next/headers')).cookies().then(store => store.get(SESSION_COOKIE_NAME)?.value);
    return verifySession(await token);
}

export async function requireApiSession(request: Request): Promise<Response | null> {
    try {
        if (await requireSession(request)) return null;
        return Response.json({ error: '未登录或登录已过期' }, { status: 401 });
    } catch (error) {
        if (error instanceof AuthConfigurationError) {
            return Response.json({ error: error.message }, { status: 500 });
        }
        throw error;
    }
}

function cookieAttributes(maxAge: number) {
    return [
        'HttpOnly',
        'SameSite=Lax',
        'Path=/',
        `Max-Age=${maxAge}`,
        process.env.NODE_ENV === 'production' ? 'Secure' : '',
    ].filter(Boolean).join('; ');
}

export function sessionCookie(token: string) {
    return `${SESSION_COOKIE_NAME}=${token}; ${cookieAttributes(SESSION_MAX_AGE_SECONDS)}`;
}

export function clearSession() {
    return `${SESSION_COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

export function validateSameOrigin(request: Request) {
    const origin = request.headers.get('origin');
    if (!origin) return true;

    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost ?? request.headers.get('host');
    const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const protocol = forwardedProtocol ?? new URL(request.url).protocol.replace(':', '');
    const expectedOrigin = host ? `${protocol}://${host}` : new URL(request.url).origin;
    return origin === expectedOrigin;
}

export function isJsonRequest(request: Request) {
    return request.headers.get('content-type')?.toLowerCase().startsWith('application/json') ?? false;
}
