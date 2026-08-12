import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const sourceRoot = new URL('../', import.meta.url);

function sourceFiles(directory: URL): URL[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = new URL(entry.name, directory);
        if (entry.isDirectory()) return sourceFiles(new URL(`${entry.name}/`, directory));
        return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [path] : [];
    });
}

test('产品源码不再请求 business API 或依赖 Prisma/auth runtime', () => {
    for (const path of sourceFiles(sourceRoot)) {
        const source = readFileSync(path, 'utf8');
        assert.doesNotMatch(source, /fetch\s*\(\s*[`'"]\/api\/(?:fuel|backup|vehicles|auth)/, path.pathname);
        assert.doesNotMatch(source, /@prisma\/client|@\/lib\/(?:db|auth)|\bPrismaClient\b/, path.pathname);
    }
});

test('产品 UI 通过 LocalRepository client helper 访问本地数据', () => {
    for (const relativePath of [
        '../components/DashboardClient.tsx',
        '../components/AddFuelForm.tsx',
        '../app/settings/data/page.tsx',
    ]) {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
        assert.match(source, /getLocalRepository/, relativePath);
    }
});

test('server business、auth 与 Prisma 模块已经移除', () => {
    for (const relativePath of [
        'app/api/auth/login/route.ts',
        'app/api/auth/logout/route.ts',
        'app/api/backup/route.ts',
        'app/api/fuel/route.ts',
        'app/api/fuel/[id]/route.ts',
        'app/api/vehicles/route.ts',
        'app/api/vehicles/[id]/route.ts',
        'app/login/page.tsx',
        'lib/auth.ts',
        'lib/db.ts',
        'lib/backup-prisma.ts',
        'proxy.ts',
    ]) {
        assert.equal(existsSync(new URL(relativePath, sourceRoot)), false, relativePath);
    }

    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    assert.equal(packageJson.dependencies?.['@prisma/client'], undefined);
    assert.equal(packageJson.devDependencies?.prisma, undefined);
});
