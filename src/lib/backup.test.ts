import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    BACKUP_SCHEMA_VERSION,
    createBackupPayload,
    parseBackupPayload,
} from './backup.ts';

const timestamp = new Date('2026-08-11T12:00:00.000Z');
const vehicle = {
    id: 'vehicle-1',
    name: '我的车',
    type: 'car',
    odometer: 99999,
    createdAt: timestamp,
    updatedAt: timestamp,
};
const records = [
    {
        id: 'record-1', vehicleId: vehicle.id, date: timestamp, mileage: 10000,
        liters: 50, price: 380, unitPrice: 7.6, fullTank: true, station: null,
        createdAt: timestamp, updatedAt: timestamp,
    },
    {
        id: 'record-2', vehicleId: vehicle.id, date: timestamp, mileage: 10550,
        liters: 50, price: 381, unitPrice: 7.62, fullTank: true, station: null,
        createdAt: timestamp, updatedAt: timestamp,
    },
];

test('导出包含 schemaVersion、exportedAt、Vehicle 和全部 FuelRecord', () => {
    const backup = createBackupPayload(vehicle, records, timestamp);

    assert.equal(backup.schemaVersion, BACKUP_SCHEMA_VERSION);
    assert.equal(backup.exportedAt, timestamp.toISOString());
    assert.equal(backup.vehicle.id, vehicle.id);
    assert.equal(backup.fuelRecords.length, 2);
    assert.equal(backup.fuelRecords[1].unitPrice, 7.62);
    assert.equal(backup.fuelRecords[1].date, timestamp.toISOString());
});

test('升数与金额、油价不一致时拒绝备份', () => {
    const backup = createBackupPayload(vehicle, records, timestamp);
    backup.fuelRecords[0] = { ...backup.fuelRecords[0], price: 380, unitPrice: 7.6, liters: 99 };

    assert.throws(() => parseBackupPayload(backup), /升数与金额、油价不一致/);
});

test('schemaVersion 1 备份 JSON round trip 保持兼容', () => {
    const backup = createBackupPayload(vehicle, records, timestamp);
    const parsed = parseBackupPayload(JSON.parse(JSON.stringify(backup)));

    assert.deepEqual(parsed, backup);
});

test('无效备份版本和缺失字段会被拒绝', () => {
    assert.throws(() => parseBackupPayload({ schemaVersion: 2 }), /不支持的备份版本/);
    assert.throws(
        () => parseBackupPayload({ schemaVersion: 1, exportedAt: timestamp.toISOString(), vehicle: {}, fuelRecords: [] }),
        /车辆 ID 格式无效/,
    );
});

test('重复记录 ID 或里程会被拒绝', () => {
    const duplicateId = createBackupPayload(vehicle, [records[0], { ...records[1], id: records[0].id }], timestamp);
    const duplicateMileage = createBackupPayload(
        vehicle,
        [records[0], { ...records[1], mileage: records[0].mileage }],
        timestamp,
    );

    assert.throws(() => parseBackupPayload(duplicateId), /加油记录 ID 重复/);
    assert.throws(() => parseBackupPayload(duplicateMileage), /加油里程重复/);
});

test('记录必须属于备份中的车辆', () => {
    const backup = createBackupPayload(vehicle, [{ ...records[0], vehicleId: 'another-vehicle' }], timestamp);

    assert.throws(() => parseBackupPayload(backup), /记录不属于备份车辆/);
});

test('Domain、fuel 与纯 backup 模块不依赖 Prisma client', () => {
    for (const relativePath of ['./domain/types.ts', './fuel.ts', './backup.ts']) {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /@prisma\/client|\bPrisma\b/, relativePath);
    }
});
