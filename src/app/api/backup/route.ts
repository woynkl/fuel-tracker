import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
    BackupExportError,
    loadBackupPayload,
    restoreBackup,
    type BackupExportHost,
    type BackupTransactionHost,
} from '@/lib/backup';

export async function GET() {
    try {
        const backup = await loadBackupPayload(prisma as unknown as BackupExportHost);
        const date = backup.exportedAt.slice(0, 10);

        return new NextResponse(JSON.stringify(backup, null, 2), {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="fuel-backup-${date}.json"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        if (error instanceof BackupExportError) {
            const status = error.code === 'NO_VEHICLE' ? 404 : 409;
            return NextResponse.json({ error: error.message }, { status });
        }
        console.error('导出备份失败', error);
        return NextResponse.json({ error: '导出失败，请稍后重试' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body: unknown = await request.json();
        const result = await restoreBackup(prisma as unknown as BackupTransactionHost, body);
        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : '导入失败，请检查备份文件';
        console.error('导入备份失败', error);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
