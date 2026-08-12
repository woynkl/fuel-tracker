import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { BackupPayload } from './domain/types';

export type BackupExportResult = {
    filename: string;
    method: 'browser-download' | 'android-share';
};

export async function exportBackupFile(backup: BackupPayload): Promise<BackupExportResult> {
    const filename = `fuel-backup-${backup.exportedAt.slice(0, 10)}.json`;
    const data = JSON.stringify(backup, null, 2);

    if (Capacitor.getPlatform() === 'android') {
        const saved = await Filesystem.writeFile({
            path: filename,
            data,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
        });
        await Share.share({
            title: '油耗记录备份',
            text: '请选择“保存到文件”或其它 APP 外部位置保存 JSON 备份。',
            files: [saved.uri],
            dialogTitle: '保存或分享油耗备份',
        });
        return { filename, method: 'android-share' };
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return { filename, method: 'browser-download' };
}
