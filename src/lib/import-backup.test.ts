import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackupPayload } from './backup.ts';
import type { BackupPayload } from './domain/types.ts';
import { importBackupAfterValidation } from './import-backup.ts';

const timestamp = new Date('2026-08-12T12:00:00.000Z');
const validBackup = (): BackupPayload => createBackupPayload({
    id: 'vehicle-1', name: '我的车辆', type: '轿车', odometer: 10000,
    createdAt: timestamp, updatedAt: timestamp,
}, [{
    id: 'record-1', vehicleId: 'vehicle-1', date: timestamp, mileage: 10000,
    liters: 50, price: 380, unitPrice: 7.6, fullTank: true, station: null,
    createdAt: timestamp, updatedAt: timestamp,
}], timestamp);

const invalidBackups = (): unknown[] => {
    const wrongVersion = { ...validBackup(), schemaVersion: 2 };
    const wrongLiters = structuredClone(validBackup());
    wrongLiters.fuelRecords[0].liters = 49;
    const wrongAssociation = structuredClone(validBackup());
    wrongAssociation.fuelRecords[0].vehicleId = 'other-vehicle';
    return [wrongVersion, wrongLiters, wrongAssociation];
};

test('备份完整校验失败时不会询问覆盖或写入', async () => {
    for (const input of invalidBackups()) {
        let confirmations = 0;
        let imports = 0;
        await assert.rejects(() => importBackupAfterValidation(
            input,
            () => { confirmations += 1; return true; },
            async () => { imports += 1; return { importedRecords: 0, odometer: 0 }; },
        ));
        assert.equal(confirmations, 0);
        assert.equal(imports, 0);
    }
});

test('用户取消覆盖后不会写入，确认后传入已校验备份', async () => {
    const backup = validBackup();
    let storedMileage = 5000;

    const cancelled = await importBackupAfterValidation(
        backup,
        () => false,
        async validated => {
            storedMileage = validated.vehicle.odometer;
            return { importedRecords: validated.fuelRecords.length, odometer: validated.vehicle.odometer };
        },
    );
    assert.equal(cancelled, null);
    assert.equal(storedMileage, 5000);

    const imported = await importBackupAfterValidation(
        backup,
        () => true,
        async validated => {
            storedMileage = validated.vehicle.odometer;
            return { importedRecords: validated.fuelRecords.length, odometer: validated.vehicle.odometer };
        },
    );
    assert.deepEqual(imported, { importedRecords: 1, odometer: 10000 });
    assert.equal(storedMileage, 10000);
});
