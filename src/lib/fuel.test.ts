import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateConsumption,
    calculateDistance,
    calculateIntervalConsumption,
    calculateLiters,
    type FuelRecord,
} from './fuel.ts';

const record = (id: string, mileage: number, liters: number, fullTank = true, price = liters * 8): FuelRecord => ({
    id,
    mileage,
    liters,
    price,
    unitPrice: 8,
    fullTank,
    date: new Date('2026-01-01'),
});

test('金额除以油价得到加油升数', () => {
    assert.ok(Math.abs(calculateLiters(380, 7.62)! - 49.8687664) < 0.000001);
    assert.equal(calculateLiters(380, 0), null);
});

test('Case 1：单条记录不能计算油耗', () => {
    const result = calculateConsumption([record('a', 10000, 50)]);
    assert.equal(result.averageConsumption, null);
    assert.equal(result.lastConsumption, null);
    assert.equal(result.totalDistance, 0);
});

test('Case 2：两次加满得到 550 km 和 9.09 L/100km', () => {
    const result = calculateConsumption([record('a', 10000, 50), record('b', 10550, 50)]);
    assert.equal(result.lastDistance, 550);
    assert.ok(Math.abs(result.lastConsumption! - 9.090909) < 0.000001);
});

test('Case 3：三次加满不计第一条基准油量', () => {
    const result = calculateConsumption([
        record('a', 10000, 60),
        record('b', 10500, 45),
        record('c', 11000, 50),
    ]);
    assert.equal(result.totalDistance, 1000);
    assert.equal(result.totalFuel, 95);
    assert.equal(result.averageConsumption, 9.5);
});

test('Case 4：中途未加满时合并到下一个完整周期', () => {
    const records = [record('a', 10000, 50), record('b', 10300, 20, false), record('c', 10600, 35)];
    const interval = calculateIntervalConsumption(records);
    assert.equal(interval?.distance, 600);
    assert.equal(interval?.liters, 55);
    assert.ok(Math.abs(interval!.consumption - 9.166666) < 0.000001);
    assert.ok(Math.abs(calculateConsumption(records).lastConsumption! - 9.166666) < 0.000001);
});

test('Case 5：非法公里数不会产生负数或 Infinity', () => {
    assert.equal(calculateDistance(10550, 10550), null);
    assert.equal(calculateDistance(10550, 10000), null);
    const result = calculateConsumption([record('a', 10550, 50), record('b', 10550, 50)]);
    assert.equal(result.averageConsumption, null);
    assert.equal(result.lastConsumption, null);
});

test('当前未加满时不显示准确周期油耗', () => {
    const result = calculateConsumption([record('a', 10000, 50), record('b', 10300, 20, false)]);
    assert.equal(result.lastDistance, 300);
    assert.equal(result.lastConsumption, null);
});
