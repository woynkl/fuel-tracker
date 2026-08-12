const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function calendarDateToStorageDate(calendarDate: string): string {
    if (!CALENDAR_DATE_PATTERN.test(calendarDate)) throw new Error('日期格式无效');

    const storedDate = `${calendarDate}T12:00:00.000Z`;
    if (new Date(storedDate).toISOString() !== storedDate) throw new Error('日期格式无效');
    return storedDate;
}
