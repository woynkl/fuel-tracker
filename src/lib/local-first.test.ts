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

test('Next 配置输出静态产物且产品路由没有动态 vehicle ID', () => {
    const nextConfig = readFileSync(new URL('../../next.config.ts', import.meta.url), 'utf8');
    assert.match(nextConfig, /output:\s*["']export["']/);
    assert.match(nextConfig, /trailingSlash:\s*true/);

    assert.equal(existsSync(new URL('app/add-fuel/page.tsx', sourceRoot)), true);
    assert.equal(existsSync(new URL('app/vehicle/[id]/page.tsx', sourceRoot)), false);
    assert.equal(existsSync(new URL('app/vehicle/[id]/add-fuel/page.tsx', sourceRoot)), false);

    const dashboard = readFileSync(new URL('../components/DashboardClient.tsx', import.meta.url), 'utf8');
    assert.match(dashboard, /router\.push\(['"]\/add-fuel['"]\)/);
    assert.doesNotMatch(dashboard, /\/vehicle\//);
});

test('静态 APP manifest 保持产品标识且源码不依赖远程运行时资源', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
    assert.equal(manifest.name, '油耗记录');
    assert.equal(manifest.short_name, '油耗');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.display, 'standalone');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

    for (const path of sourceFiles(sourceRoot)) {
        const source = readFileSync(path, 'utf8');
        assert.doesNotMatch(source, /next\/font|https?:\/\//, path.pathname);
    }
});
