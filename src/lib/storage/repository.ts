import type { BackupPayload, FuelRecord, Vehicle } from '../domain/types';

export type StoredVehicle = Vehicle<string>;
export type StoredFuelRecord = FuelRecord<string>;

export type AddFuelRecordInput = {
    mileage: number;
    amount: number;
    unitPrice: number;
    date: Date | string;
    fullTank: boolean;
    station?: string | null;
};

export type SaveVehicleInput = {
    name: string;
    type: string;
};

export type ImportResult = {
    importedRecords: number;
    odometer: number;
};

export interface LocalRepository {
    initialize(): Promise<StoredVehicle>;
    getVehicle(): Promise<StoredVehicle | null>;
    saveVehicle(input: SaveVehicleInput): Promise<StoredVehicle>;
    listFuelRecords(): Promise<StoredFuelRecord[]>;
    addFuelRecord(input: AddFuelRecordInput): Promise<StoredFuelRecord>;
    deleteFuelRecord(id: string): Promise<boolean>;
    exportData(): Promise<BackupPayload>;
    importData(input: unknown): Promise<ImportResult>;
    clearAllData(): Promise<void>;
    close(): void;
}
