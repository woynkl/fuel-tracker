"use client";

import { ChangeEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export default function DataSettingsPage() {
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [importing, setImporting] = useState(false);

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
            const response = await fetch('/api/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(backup),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok) throw new Error(result?.error ?? '导入失败，请检查备份文件');

            setStatus({
                type: 'success',
                message: `导入完成：${result.importedRecords} 条加油记录，当前里程 ${result.odometer} km`,
            });
            router.refresh();
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
                    <a className="btn btn-primary data-link" href="/api/backup" download>导出数据</a>
                </article>

                <article className="data-action danger-action">
                    <div>
                        <h2>导入备份</h2>
                        <p>导入会完整覆盖当前数据。服务器会先校验文件，再通过单个事务恢复。</p>
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
            </section>
        </main>
    );
}
