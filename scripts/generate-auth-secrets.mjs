import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Writable } from 'node:stream';
import { hashPassword } from '../src/lib/auth.ts';

async function readPassword() {
    const prompt = '输入 APP 登录密码：';
    if (!stdin.isTTY) {
        const readline = createInterface({ input: stdin, output: stdout });
        const value = await readline.question(prompt);
        readline.close();
        return value;
    }

    let muted = true;
    const hiddenOutput = new Writable({
        write(chunk, encoding, callback) {
            if (!muted) stdout.write(chunk, encoding);
            callback();
        },
    });
    stdout.write(prompt);
    const readline = createInterface({ input: stdin, output: hiddenOutput, terminal: true });
    const value = await readline.question('');
    muted = false;
    readline.close();
    stdout.write('\n');
    return value;
}

const password = await readPassword();

if (!password) {
    console.error('密码不能为空。');
    process.exitCode = 1;
} else {
    const passwordHash = await hashPassword(password);
    const sessionSecret = randomBytes(32).toString('base64url');
    console.log('\n将以下值保存到本地 .env 或部署平台的环境变量中；不要提交实际值：\n');
    console.log(`APP_PASSWORD_HASH=${passwordHash}`);
    console.log(`SESSION_SECRET=${sessionSecret}`);
}
