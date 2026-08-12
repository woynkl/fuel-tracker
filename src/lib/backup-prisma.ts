import { createBackupPayload, parseBackupPayload } from './backup.ts';
import type { FuelRecord, Vehicle } from './domain/types';

type WriteResult = Promise<unknown>;

export type BackupTransactionClient = {
    fuelRecord: {
        deleteMany(): WriteResult;
        create(args: { data: Record<string, unknown> }): WriteResult;
    };
    maintenanceConfig: {
        deleteMany(): WriteResult;
    };
    vehicle: {
        deleteMany(): WriteResult;
        create(args: { data: Record<string, unknown> }): WriteResult;
    };
};

export type BackupTransactionHost = {
    $transaction<T>(callback: (transaction: BackupTransactionClient) => Promise<T>): Promise<T>;
};

export type BackupExportHost = {
    vehicle: {
        findMany(args: { orderBy: { createdAt: 'asc' }; take: number }): Promise<Vehicle[]>;
    };
    fuelRecord: {
        findMany(args: { where: { vehicleId: string }; orderBy: { mileage: 'asc' } }): Promise<FuelRecord[]>;
    };
};

export class BackupExportError extends Error {
    readonly code: 'NO_VEHICLE' | 'MULTIPLE_VEHICLES';

    constructor(code: 'NO_VEHICLE' | 'MULTIPLE_VEHICLES', message: string) {
        super(message);
        this.name = 'BackupExportError';
        this.code = code;
    }
}

export async function loadBackupPayload(database: BackupExportHost, exportedAt: Date = new Date()) {
    const vehicles = await database.vehicle.findMany({ orderBy: { createdAt: 'asc' }, take: 2 });
    if (vehicles.length === 0) throw new BackupExportError('NO_VEHICLE', '暂无车辆数据可导出');
    if (vehicles.length > 1) {
        throw new BackupExportError(
            'MULTIPLE_VEHICLES',
            '检测到旧版多车辆数据。为避免生成不完整备份，请先处理为单车辆数据后再导出。',
        );
    }

    const vehicle = vehicles[0];
    const fuelRecords = await database.fuelRecord.findMany({
        where: { vehicleId: vehicle.id },
        orderBy: { mileage: 'asc' },
    });
    return createBackupPayload(vehicle, fuelRecords, exportedAt);
}

export async function restoreBackup(database: BackupTransactionHost, input: unknown) {
    const backup = parseBackupPayload(input);
    const odometer = backup.fuelRecords.reduce((maximum, record) => Math.max(maximum, record.mileage), 0);

    return database.$transaction(async transaction => {
        await transaction.fuelRecord.deleteMany();
        await transaction.maintenanceConfig.deleteMany();
        await transaction.vehicle.deleteMany();

        await transaction.vehicle.create({
            data: {
                ...backup.vehicle,
                odometer,
                createdAt: new Date(backup.vehicle.createdAt),
                updatedAt: new Date(backup.vehicle.updatedAt),
            },
        });

        for (const record of backup.fuelRecords) {
            await transaction.fuelRecord.create({
                data: {
                    ...record,
                    date: new Date(record.date),
                    createdAt: new Date(record.createdAt),
                    updatedAt: new Date(record.updatedAt),
                },
            });
        }

        return { importedRecords: backup.fuelRecords.length, odometer };
    });
}
