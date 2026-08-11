import type { Prisma } from '@prisma/client';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_LITERS_TOLERANCE = 0.01;

export type BackupVehicle = {
    id: string;
    name: string;
    type: string;
    odometer: number;
    createdAt: string;
    updatedAt: string;
};

export type BackupFuelRecord = {
    id: string;
    vehicleId: string;
    date: string;
    mileage: number;
    liters: number;
    price: number;
    unitPrice: number;
    fullTank: boolean;
    station: string | null;
    createdAt: string;
    updatedAt: string;
};

export type FuelBackup = {
    schemaVersion: typeof BACKUP_SCHEMA_VERSION;
    exportedAt: string;
    vehicle: BackupVehicle;
    fuelRecords: BackupFuelRecord[];
};

type DateValue = Date | string;
type VehicleSource = Omit<BackupVehicle, 'createdAt' | 'updatedAt'> & {
    createdAt: DateValue;
    updatedAt: DateValue;
};
type FuelRecordSource = Omit<BackupFuelRecord, 'date' | 'createdAt' | 'updatedAt'> & {
    date: DateValue;
    createdAt: DateValue;
    updatedAt: DateValue;
};

export type BackupTransactionHost = {
    $transaction<T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

export type BackupExportHost = {
    vehicle: {
        findMany(args: { orderBy: { createdAt: 'asc' }; take: number }): Promise<VehicleSource[]>;
    };
    fuelRecord: {
        findMany(args: { where: { vehicleId: string }; orderBy: { mileage: 'asc' } }): Promise<FuelRecordSource[]>;
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

const object = (value: unknown, label: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${label} 格式无效`);
    }
    return value as Record<string, unknown>;
};

const string = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} 格式无效`);
    return value;
};

const integer = (value: unknown, label: string, minimum: number): number => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
        throw new Error(`${label} 格式无效`);
    }
    return value;
};

const positiveNumber = (value: unknown, label: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} 格式无效`);
    }
    return value;
};

const isoDate = (value: unknown, label: string): string => {
    const date = value instanceof Date ? value : new Date(string(value, label));
    if (Number.isNaN(date.getTime())) throw new Error(`${label} 格式无效`);
    return date.toISOString();
};

export function createBackupPayload(
    vehicle: VehicleSource,
    fuelRecords: FuelRecordSource[],
    exportedAt: Date = new Date(),
): FuelBackup {
    return {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: exportedAt.toISOString(),
        vehicle: {
            ...vehicle,
            createdAt: isoDate(vehicle.createdAt, '车辆创建时间'),
            updatedAt: isoDate(vehicle.updatedAt, '车辆更新时间'),
        },
        fuelRecords: fuelRecords.map(record => ({
            ...record,
            date: isoDate(record.date, '加油日期'),
            createdAt: isoDate(record.createdAt, '记录创建时间'),
            updatedAt: isoDate(record.updatedAt, '记录更新时间'),
        })),
    };
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

export function parseBackupPayload(input: unknown): FuelBackup {
    const root = object(input, '备份文件');
    if (root.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        throw new Error(`不支持的备份版本：${String(root.schemaVersion)}`);
    }

    const rawVehicle = object(root.vehicle, '车辆数据');
    const vehicle: BackupVehicle = {
        id: string(rawVehicle.id, '车辆 ID'),
        name: string(rawVehicle.name, '车辆名称'),
        type: string(rawVehicle.type, '车辆类型'),
        odometer: integer(rawVehicle.odometer, '车辆里程', 0),
        createdAt: isoDate(rawVehicle.createdAt, '车辆创建时间'),
        updatedAt: isoDate(rawVehicle.updatedAt, '车辆更新时间'),
    };

    if (!Array.isArray(root.fuelRecords)) throw new Error('加油记录格式无效');
    const ids = new Set<string>();
    const mileages = new Set<number>();
    const fuelRecords = root.fuelRecords.map((value, index): BackupFuelRecord => {
        const raw = object(value, `第 ${index + 1} 条加油记录`);
        const id = string(raw.id, `第 ${index + 1} 条记录 ID`);
        const vehicleId = string(raw.vehicleId, `第 ${index + 1} 条车辆 ID`);
        const mileage = integer(raw.mileage, `第 ${index + 1} 条里程`, 1);
        if (vehicleId !== vehicle.id) throw new Error(`第 ${index + 1} 条记录不属于备份车辆`);
        if (ids.has(id)) throw new Error(`加油记录 ID 重复：${id}`);
        if (mileages.has(mileage)) throw new Error(`加油里程重复：${mileage} km`);
        ids.add(id);
        mileages.add(mileage);

        if (typeof raw.fullTank !== 'boolean') throw new Error(`第 ${index + 1} 条是否加满格式无效`);
        if (raw.station !== null && raw.station !== undefined && typeof raw.station !== 'string') {
            throw new Error(`第 ${index + 1} 条加油站格式无效`);
        }

        const liters = positiveNumber(raw.liters, `第 ${index + 1} 条升数`);
        const price = positiveNumber(raw.price, `第 ${index + 1} 条金额`);
        const unitPrice = positiveNumber(raw.unitPrice, `第 ${index + 1} 条油价`);
        const expectedLiters = price / unitPrice;
        if (Math.abs(liters - expectedLiters) > BACKUP_LITERS_TOLERANCE + 1e-9) {
            throw new Error(
                `第 ${index + 1} 条加油升数与金额、油价不一致（应约为 ${expectedLiters.toFixed(2)} L）`,
            );
        }

        return {
            id,
            vehicleId,
            date: isoDate(raw.date, `第 ${index + 1} 条加油日期`),
            mileage,
            liters,
            price,
            unitPrice,
            fullTank: raw.fullTank,
            station: typeof raw.station === 'string' ? raw.station : null,
            createdAt: isoDate(raw.createdAt, `第 ${index + 1} 条创建时间`),
            updatedAt: isoDate(raw.updatedAt, `第 ${index + 1} 条更新时间`),
        };
    });

    return {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: isoDate(root.exportedAt, '导出时间'),
        vehicle,
        fuelRecords,
    };
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
