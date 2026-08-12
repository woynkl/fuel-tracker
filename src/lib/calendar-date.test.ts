import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDateToStorageDate } from './calendar-date.ts';

const calendarDateIn = (isoDate: string, timeZone: string): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(isoDate));
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
};

test('业务日期以 noon UTC 存储，在常见正负时区都不显示成前一天', () => {
    const storedDate = calendarDateToStorageDate('2026-08-12');

    assert.equal(storedDate, '2026-08-12T12:00:00.000Z');
    assert.equal(calendarDateIn(storedDate, 'Asia/Tokyo'), '2026-08-12');
    assert.equal(calendarDateIn(storedDate, 'America/Los_Angeles'), '2026-08-12');
});

test('业务日期 helper 拒绝无效 calendar date', () => {
    assert.throws(() => calendarDateToStorageDate('2026-02-30'), /日期格式无效/);
    assert.throws(() => calendarDateToStorageDate('2026/08/12'), /日期格式无效/);
});
