import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { calculateConsumption } from '../fuel.ts';
import { IndexedDbRepository, LOCAL_DATABASE_NAME, LOCAL_DATABASE_VERSION } from './indexeddb.ts';
import type { StoredFuelRecord } from './repository.ts';

const fixedDate = new Date('2026-08-12T08:00:00.000Z');

function repository(factory = new IDBFactory(), ids = ['vehicle-1', 'record-1', 'record-2', 'record-3']) {
    let index = 0;
    return new IndexedDbRepository({
        indexedDB: factory,
        createId: () => ids[index++] ?? `generated-${index}`,
        now: () => fixedDate,
    });
}

const firstFill = {
    mileage: 10000,
    amount: 380,
    unitPrice: 7.6,
    date: '2026-08-10T00:00:00.000Z',
    fullTank: true,
};

test('schema v1 初始化空数据库并只建立一个默认车辆', async () => {
    const local = repository();
    const first = await local.initialize();
    const second = await local.initialize();

    assert.equal(LOCAL_DATABASE_NAME, 'fuel-tracker');
    assert.equal(LOCAL_DATABASE_VERSION, 1);
    assert.deepEqual(second, first);
    assert.equal(first.name, '我的车');
    assert.equal(first.type, 'car');
    assert.equal(first.odometer, 0);
    local.close();
});

test('添加记录时计算 liters、保持 mileage 顺序并同步 vehicle odometer', async () => {
    const local = repository();
    const first = await local.addFuelRecord(firstFill);
    const second = await local.addFuelRecord({
        mileage: 10550,
        amount: 381,
        unitPrice: 7.62,
        date: new Date('2026-08-11T00:00:00.000Z'),
        fullTank: true,
    });

    assert.equal(first.liters, 50);
    assert.equal(first.date, '2026-08-10T00:00:00.000Z');
    assert.equal(second.liters, 50);
    assert.deepEqual((await local.listFuelRecords()).map(record => record.mileage), [10000, 10550]);
    assert.equal((await local.getVehicle())?.odometer, 10550);
    const stats = calculateConsumption(await local.listFuelRecords());
    assert.equal(stats.lastDistance, 550);
    assert.ok(Math.abs(stats.lastConsumption! - 9.090909) < 0.000001);
    local.close();
});

test('拒绝非法数值和不递增 mileage，失败不留下半完成写入', async () => {
    const local = repository();

    for (const invalid of [
        { ...firstFill, mileage: 0 },
        { ...firstFill, amount: 0 },
        { ...firstFill, unitPrice: 0 },
    ]) {
        await assert.rejects(() => local.addFuelRecord(invalid), /必须/);
    }

    await local.addFuelRecord(firstFill);
    await assert.rejects(() => local.addFuelRecord({ ...firstFill, mileage: 10000 }), /必须大于当前最新里程/);
    await assert.rejects(() => local.addFuelRecord({ ...firstFill, mileage: 9999 }), /必须大于当前最新里程/);
    assert.deepEqual((await local.listFuelRecords()).map(record => record.mileage), [10000]);
    assert.equal((await local.getVehicle())?.odometer, 10000);
    local.close();
});

test('关闭 repository A 后 repository B 仍读取同一 IndexedDB 数据', async () => {
    const factory = new IDBFactory();
    const firstRepository = repository(factory);
    await firstRepository.addFuelRecord(firstFill);
    firstRepository.close();

    const secondRepository = repository(factory, ['unused-vehicle']);
    const records = await secondRepository.listFuelRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0].mileage, 10000);
    assert.equal((await secondRepository.getVehicle())?.id, 'vehicle-1');
    secondRepository.close();
});

test('删除记录会重算 odometer，不存在的 ID 明确返回 false', async () => {
    const local = repository();
    const first = await local.addFuelRecord(firstFill);
    const second = await local.addFuelRecord({ ...firstFill, mileage: 10550 });

    assert.equal(await local.deleteFuelRecord('missing'), false);
    assert.equal(await local.deleteFuelRecord(second.id), true);
    assert.equal((await local.getVehicle())?.odometer, 10000);
    assert.equal(await local.deleteFuelRecord(first.id), true);
    assert.equal((await local.getVehicle())?.odometer, 0);
    assert.deepEqual(await local.listFuelRecords(), []);
    local.close();
});

test('schemaVersion 1 backup 可在两个 IndexedDB repository 间 round trip', async () => {
    const source = repository();
    await source.addFuelRecord(firstFill);
    await source.addFuelRecord({ ...firstFill, mileage: 10550, amount: 381, unitPrice: 7.62 });
    const backup = await source.exportData();

    const target = repository(new IDBFactory(), ['target-default']);
    const result = await target.importData(JSON.parse(JSON.stringify(backup)));

    assert.equal(backup.schemaVersion, 1);
    assert.deepEqual(result, { importedRecords: 2, odometer: 10550 });
    assert.deepEqual(await target.exportData(), backup);
    source.close();
    target.close();
});

test('无效 import 在 transaction 前失败并完整保留原数据', async () => {
    const local = repository();
    await local.addFuelRecord(firstFill);
    const before = await local.exportData();
    const invalid = structuredClone(before);
    invalid.fuelRecords[0].liters = 99;

    await assert.rejects(() => local.importData(invalid), /升数与金额、油价不一致/);
    assert.deepEqual(await local.exportData(), before);
    local.close();
});

test('import transaction 中途写入失败会回滚 vehicle 和全部 fuelRecords', async () => {
    class FailingImportRepository extends IndexedDbRepository {
        private importedRecords = 0;

        protected override async writeImportedFuelRecord(store: IDBObjectStore, record: StoredFuelRecord) {
            this.importedRecords += 1;
            if (this.importedRecords === 2) throw new Error('模拟 IndexedDB 写入失败');
            await super.writeImportedFuelRecord(store, record);
        }
    }

    const factory = new IDBFactory();
    const local = new FailingImportRepository({
        indexedDB: factory,
        createId: () => 'original-vehicle',
        now: () => fixedDate,
    });
    await local.addFuelRecord(firstFill);
    const before = await local.exportData();

    const source = repository(new IDBFactory());
    await source.addFuelRecord(firstFill);
    await source.addFuelRecord({ ...firstFill, mileage: 10550 });
    const replacement = await source.exportData();

    await assert.rejects(() => local.importData(replacement), /模拟 IndexedDB 写入失败/);
    assert.deepEqual(await local.exportData(), before);
    source.close();
    local.close();
});

test('可导入当前 server schemaVersion 1 legacy backup 并重算 odometer', async () => {
    const legacy = {
        schemaVersion: 1,
        exportedAt: '2026-08-12T00:00:00.000Z',
        vehicle: {
            id: 'legacy-vehicle', name: '我的车', type: 'car', odometer: 99999,
            createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z',
        },
        fuelRecords: [
            {
                id: 'legacy-record', vehicleId: 'legacy-vehicle', date: '2026-08-10T00:00:00.000Z',
                mileage: 10000, liters: 50, price: 380, unitPrice: 7.6, fullTank: true, station: null,
                createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
            },
        ],
    };
    const local = repository();
    await local.importData(legacy);

    assert.equal((await local.getVehicle())?.id, 'legacy-vehicle');
    assert.equal((await local.getVehicle())?.odometer, 10000);
    assert.equal((await local.listFuelRecords())[0].id, 'legacy-record');
    local.close();
});

test('clearAllData 原子清空两个 stores，下一次 initialize 重建默认车辆', async () => {
    const local = repository();
    await local.addFuelRecord(firstFill);
    await local.clearAllData();

    assert.equal(await local.getVehicle(), null);
    assert.deepEqual(await local.listFuelRecords(), []);
    const reinitialized = await local.initialize();
    assert.equal(reinitialized.name, '我的车');
    assert.equal(reinitialized.odometer, 0);
    local.close();
});
