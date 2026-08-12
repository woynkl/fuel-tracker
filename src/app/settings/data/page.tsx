"use client";

import { ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { getLocalRepository } from '@/lib/storage/client';

export default function DataSettingsPage() {
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);

    const exportBackup = async () => {
        setStatus(null);
        setExporting(true);
        try {
            const backup = await getLocalRepository().exportData();
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fuel-backup-${backup.exportedAt.slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus({ type: 'success', message: `已导出 ${backup.fuelRecords.length} 条加油记录` });
        } catch (error) {
            setStatus({ type: 'error', message: error instanceof Error ? error.message : '导出失败' });
        } finally {
            setExporting(false);
        }
    };

    const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setStatus(null);

        if (file.size > 10 * 1024 * 1024) {
            setStatus({ type: 'error', message: '备份文件不能超过 10 MB' });
            return;
        }

        let backup: unknown;
        try {
            backup = JSON.parse(await file.text());
        } catch {
            setStatus({ type: 'error', message: '无法读取 JSON，请选择有效的备份文件' });
            return;
        }

        const confirmed = window.confirm(
            '导入备份将覆盖当前车辆和全部加油记录。此操作无法撤销，确定继续吗？',
        );
        if (!confirmed) return;

        setImporting(true);
        try {
            const repository = getLocalRepository();
            const result = await repository.importData(backup);
            const [vehicle, records] = await Promise.all([
                repository.getVehicle(),
                repository.listFuelRecords(),
            ]);
            if (!vehicle || records.length !== result.importedRecords) throw new Error('导入后数据校验失败');

            setStatus({
                type: 'success',
                message: `导入完成：${result.importedRecords} 条加油记录，当前里程 ${result.odometer} km`,
            });
        } catch (error) {
            setStatus({ type: 'error', message: error instanceof Error ? error.message : '导入失败' });
        } finally {
            setImporting(false);
        }
    };

    return (
        <main className="layout-container form-page">
            <header className="form-header">
                <Button variant="ghost" className="mb-2 pl-0" onClick={() => router.push('/')}>← 返回首页</Button>
                <h1>数据管理</h1>
                <p className="text-muted">备份或恢复这台设备上的个人油耗数据</p>
            </header>

            <section className="md-card settings-card">
                <article className="data-action">
                    <div>
                        <h2>导出数据</h2>
                        <p>下载包含车辆、全部加油记录、版本和导出时间的 JSON 文件。</p>
                    </div>
                    <Button disabled={exporting} onClick={() => void exportBackup()}>
                        {exporting ? '导出中…' : '导出数据'}
                    </Button>
                </article>

                <article className="data-action danger-action">
                    <div>
                        <h2>导入备份</h2>
                        <p>导入会完整覆盖当前设备数据。本地存储会先校验文件，再通过单个事务恢复。</p>
                    </div>
                    <input
                        ref={fileInput}
                        className="file-input"
                        type="file"
                        accept="application/json,.json"
                        onChange={importBackup}
                    />
                    <Button variant="secondary" disabled={importing} onClick={() => fileInput.current?.click()}>
                        {importing ? '导入中…' : '选择备份文件'}
                    </Button>
                </article>

                {status && <p className={`backup-status ${status.type}`} role="status">{status.message}</p>}
                <p className="local-data-notice">数据只保存在当前设备。建议定期导出备份；卸载 APP 前必须先导出备份。</p>
            </section>
        </main>
    );
}
