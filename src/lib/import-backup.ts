import { parseBackupPayload } from './backup.ts';
import type { BackupPayload } from './domain/types.ts';
import type { ImportResult } from './storage/repository.ts';

type ConfirmOverwrite = () => boolean;
type ImportValidatedBackup = (backup: BackupPayload) => Promise<ImportResult>;

export async function importBackupAfterValidation(
    input: unknown,
    confirmOverwrite: ConfirmOverwrite,
    importValidatedBackup: ImportValidatedBackup,
): Promise<ImportResult | null> {
    const backup = parseBackupPayload(input);
    if (!confirmOverwrite()) return null;
    return importValidatedBackup(backup);
}
