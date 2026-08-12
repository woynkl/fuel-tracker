import { createBackupPayload, parseBackupPayload } from '../backup.ts';
import type {
    AddFuelRecordInput,
    ImportResult,
    LocalRepository,
    SaveVehicleInput,
    StoredFuelRecord,
    StoredVehicle,
} from './repository';

export const LOCAL_DATABASE_NAME = 'fuel-tracker';
export const LOCAL_DATABASE_VERSION = 1;

const VEHICLE_STORE = 'vehicle';
const FUEL_RECORDS_STORE = 'fuelRecords';
const MILEAGE_INDEX = 'mileage';

type RepositoryOptions = {
    databaseName?: string;
    indexedDB?: IDBFactory;
    createId?: () => string;
    now?: () => Date;
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
});

const transactionResult = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction 已中止'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction 失败'));
});

const positiveInteger = (value: number, label: string) => {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} 必须是大于 0 的整数`);
};

const positiveNumber = (value: number, label: string) => {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} 必须大于 0`);
};

const requiredString = (value: string, label: string) => {
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} 不能为空`);
    return value.trim();
};

const isoDate = (value: Date | string, label: string) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`${label} 格式无效`);
    return date.toISOString();
};

export class IndexedDbRepository implements LocalRepository {
    private readonly databaseName: string;
    private readonly indexedDB: IDBFactory;
    private readonly createId: () => string;
    private readonly now: () => Date;
    private databasePromise: Promise<IDBDatabase> | null = null;

    constructor(options: RepositoryOptions = {}) {
        const factory = options.indexedDB ?? globalThis.indexedDB;
        if (!factory) throw new Error('当前环境不支持 IndexedDB');

        this.databaseName = options.databaseName ?? LOCAL_DATABASE_NAME;
        this.indexedDB = factory;
        this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
        this.now = options.now ?? (() => new Date());
    }

    private openDatabase(): Promise<IDBDatabase> {
        if (this.databasePromise) return this.databasePromise;

        this.databasePromise = new Promise((resolve, reject) => {
            const request = this.indexedDB.open(this.databaseName, LOCAL_DATABASE_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(VEHICLE_STORE)) {
                    database.createObjectStore(VEHICLE_STORE, { keyPath: 'id' });
                }
                if (!database.objectStoreNames.contains(FUEL_RECORDS_STORE)) {
                    const records = database.createObjectStore(FUEL_RECORDS_STORE, { keyPath: 'id' });
                    records.createIndex(MILEAGE_INDEX, 'mileage', { unique: true });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                this.databasePromise = null;
                reject(request.error ?? new Error('无法打开 IndexedDB'));
            };
            request.onblocked = () => {
                this.databasePromise = null;
                reject(new Error('IndexedDB upgrade 被其他连接阻止'));
            };
        });

        return this.databasePromise;
    }

    async initialize(): Promise<StoredVehicle> {
        const database = await this.openDatabase();
        const transaction = database.transaction(VEHICLE_STORE, 'readwrite');
        const completed = transactionResult(transaction);
        const store = transaction.objectStore(VEHICLE_STORE);
        const vehicles = await requestResult(store.getAll() as IDBRequest<StoredVehicle[]>);

        let vehicle = vehicles[0];
        if (!vehicle) {
            const timestamp = this.now().toISOString();
            vehicle = {
                id: this.createId(),
                name: '我的车',
                type: 'car',
                odometer: 0,
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            await requestResult(store.add(vehicle));
        }

        await completed;
        return vehicle;
    }

    async getVehicle(): Promise<StoredVehicle | null> {
        const database = await this.openDatabase();
        const transaction = database.transaction(VEHICLE_STORE, 'readonly');
        const vehicles = await requestResult(
            transaction.objectStore(VEHICLE_STORE).getAll() as IDBRequest<StoredVehicle[]>,
        );
        return vehicles[0] ?? null;
    }

    async saveVehicle(input: SaveVehicleInput): Promise<StoredVehicle> {
        const name = requiredString(input.name, '车辆名称');
        const type = requiredString(input.type, '车辆类型');
        await this.initialize();
        const database = await this.openDatabase();
        const transaction = database.transaction([VEHICLE_STORE, FUEL_RECORDS_STORE], 'readwrite');
        const completed = transactionResult(transaction);
        const vehicles = transaction.objectStore(VEHICLE_STORE);
        const existing = (await requestResult(
            vehicles.getAll() as IDBRequest<StoredVehicle[]>,
        ))[0];
        if (!existing) {
            transaction.abort();
            await completed.catch(() => undefined);
            throw new Error('当前车辆不存在');
        }

        const latest = await requestResult(
            transaction.objectStore(FUEL_RECORDS_STORE).index(MILEAGE_INDEX)
                .openCursor(null, 'prev') as IDBRequest<IDBCursorWithValue | null>,
        );
        const saved: StoredVehicle = {
            ...existing,
            name,
            type,
            odometer: latest ? (latest.value as StoredFuelRecord).mileage : 0,
            updatedAt: this.now().toISOString(),
        };
        await requestResult(vehicles.put(saved));
        await completed;
        return saved;
    }

    async listFuelRecords(): Promise<StoredFuelRecord[]> {
        const database = await this.openDatabase();
        const transaction = database.transaction(FUEL_RECORDS_STORE, 'readonly');
        return requestResult(
            transaction.objectStore(FUEL_RECORDS_STORE).index(MILEAGE_INDEX).getAll() as IDBRequest<StoredFuelRecord[]>,
        );
    }

    async addFuelRecord(input: AddFuelRecordInput): Promise<StoredFuelRecord> {
        positiveInteger(input.mileage, '里程');
        positiveNumber(input.amount, '金额');
        positiveNumber(input.unitPrice, '油价');
        if (typeof input.fullTank !== 'boolean') throw new Error('是否加满格式无效');
        const date = isoDate(input.date, '加油日期');
        const vehicle = await this.initialize();
        const timestamp = this.now().toISOString();
        const record: StoredFuelRecord = {
            id: this.createId(),
            vehicleId: vehicle.id,
            mileage: input.mileage,
            liters: input.amount / input.unitPrice,
            price: input.amount,
            unitPrice: input.unitPrice,
            date,
            fullTank: input.fullTank,
            station: input.station ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        const database = await this.openDatabase();
        const transaction = database.transaction([VEHICLE_STORE, FUEL_RECORDS_STORE], 'readwrite');
        const completed = transactionResult(transaction);
        const records = transaction.objectStore(FUEL_RECORDS_STORE);
        const latest = await requestResult(
            records.index(MILEAGE_INDEX).openCursor(null, 'prev') as IDBRequest<IDBCursorWithValue | null>,
        );
        if (latest && input.mileage <= (latest.value as StoredFuelRecord).mileage) {
            transaction.abort();
            await completed.catch(() => undefined);
            throw new Error('新里程必须大于当前最新里程');
        }

        await requestResult(records.add(record));
        await requestResult(transaction.objectStore(VEHICLE_STORE).put({
            ...vehicle,
            odometer: record.mileage,
            updatedAt: timestamp,
        }));
        await completed;
        return record;
    }

    async deleteFuelRecord(id: string): Promise<boolean> {
        const vehicle = await this.initialize();
        const database = await this.openDatabase();
        const transaction = database.transaction([VEHICLE_STORE, FUEL_RECORDS_STORE], 'readwrite');
        const completed = transactionResult(transaction);
        const records = transaction.objectStore(FUEL_RECORDS_STORE);
        const existing = await requestResult(records.get(id) as IDBRequest<StoredFuelRecord | undefined>);
        if (!existing) {
            await completed;
            return false;
        }

        await requestResult(records.delete(id));
        const latest = await requestResult(
            records.index(MILEAGE_INDEX).openCursor(null, 'prev') as IDBRequest<IDBCursorWithValue | null>,
        );
        await requestResult(transaction.objectStore(VEHICLE_STORE).put({
            ...vehicle,
            odometer: latest ? (latest.value as StoredFuelRecord).mileage : 0,
            updatedAt: this.now().toISOString(),
        }));
        await completed;
        return true;
    }

    async exportData() {
        const vehicle = await this.initialize();
        const records = await this.listFuelRecords();
        return createBackupPayload(vehicle, records, this.now());
    }

    protected async writeImportedFuelRecord(
        store: IDBObjectStore,
        record: StoredFuelRecord,
    ): Promise<void> {
        await requestResult(store.add(record));
    }

    async importData(input: unknown): Promise<ImportResult> {
        const backup = parseBackupPayload(input);
        const odometer = backup.fuelRecords.reduce((maximum, record) => Math.max(maximum, record.mileage), 0);
        const vehicle = { ...backup.vehicle, odometer };
        const database = await this.openDatabase();
        const transaction = database.transaction([VEHICLE_STORE, FUEL_RECORDS_STORE], 'readwrite');
        const completed = transactionResult(transaction);
        const vehicles = transaction.objectStore(VEHICLE_STORE);
        const records = transaction.objectStore(FUEL_RECORDS_STORE);

        try {
            await requestResult(records.clear());
            await requestResult(vehicles.clear());
            await requestResult(vehicles.add(vehicle));
            for (const record of backup.fuelRecords) await this.writeImportedFuelRecord(records, record);
            await completed;
        } catch (error) {
            try {
                transaction.abort();
            } catch {
                // A failed IndexedDB request may already have aborted the transaction.
            }
            await completed.catch(() => undefined);
            throw error;
        }

        return { importedRecords: backup.fuelRecords.length, odometer };
    }

    async clearAllData(): Promise<void> {
        const database = await this.openDatabase();
        const transaction = database.transaction([VEHICLE_STORE, FUEL_RECORDS_STORE], 'readwrite');
        const completed = transactionResult(transaction);
        await requestResult(transaction.objectStore(FUEL_RECORDS_STORE).clear());
        await requestResult(transaction.objectStore(VEHICLE_STORE).clear());
        await completed;
    }

    close(): void {
        if (!this.databasePromise) return;
        void this.databasePromise.then(database => database.close()).catch(() => undefined);
        this.databasePromise = null;
    }
}
