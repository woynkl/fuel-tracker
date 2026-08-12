import type { FuelRecord as DomainFuelRecord } from './domain/types';

export type FuelRecord = Pick<
    DomainFuelRecord,
    'id' | 'mileage' | 'liters' | 'price' | 'unitPrice' | 'fullTank' | 'date'
>;

export type IntervalConsumption = {
    startMileage: number;
    endMileage: number;
    distance: number;
    liters: number;
    cost: number;
    consumption: number;
    costPerKm: number;
    costPer100Km: number;
};

export type ConsumptionStats = {
    recordCount: number;
    totalDistance: number;
    totalFuel: number;
    totalCost: number;
    totalPaid: number;
    averageConsumption: number | null;
    averageCostPerKm: number | null;
    averageCostPer100Km: number | null;
    lastDistance: number | null;
    lastLiters: number | null;
    lastConsumption: number | null;
    lastCostPerKm: number | null;
    lastCostPer100Km: number | null;
};

const isPositiveFinite = (value: number) => Number.isFinite(value) && value > 0;

export function calculateLiters(price: number, unitPrice: number): number | null {
    if (!isPositiveFinite(price) || !isPositiveFinite(unitPrice)) return null;
    return price / unitPrice;
}

export function calculateDistance(startMileage: number, endMileage: number): number | null {
    const distance = endMileage - startMileage;
    return Number.isFinite(distance) && distance > 0 ? distance : null;
}

export function calculateIntervalConsumption(records: FuelRecord[]): IntervalConsumption | null {
    const sorted = [...records].sort((a, b) => a.mileage - b.mileage);
    if (sorted.length < 2 || !sorted[0].fullTank || !sorted.at(-1)?.fullTank) return null;

    const distance = calculateDistance(sorted[0].mileage, sorted.at(-1)!.mileage);
    if (distance === null) return null;

    const replenishments = sorted.slice(1);
    const liters = replenishments.reduce((sum, record) => sum + record.liters, 0);
    const cost = replenishments.reduce((sum, record) => sum + record.price, 0);
    if (!Number.isFinite(liters) || liters <= 0 || !Number.isFinite(cost) || cost < 0) return null;

    return {
        startMileage: sorted[0].mileage,
        endMileage: sorted.at(-1)!.mileage,
        distance,
        liters,
        cost,
        consumption: liters / distance * 100,
        costPerKm: cost / distance,
        costPer100Km: cost / distance * 100,
    };
}

export function calculateCostPerKm(cost: number, distance: number): number | null {
    return isPositiveFinite(cost) && isPositiveFinite(distance) ? cost / distance : null;
}

export function calculateCostPer100Km(cost: number, distance: number): number | null {
    const perKm = calculateCostPerKm(cost, distance);
    return perKm === null ? null : perKm * 100;
}

export function calculateConsumption(records: FuelRecord[]): ConsumptionStats {
    const sorted = [...records]
        .filter(record => Number.isFinite(record.mileage) && isPositiveFinite(record.liters) && isPositiveFinite(record.price))
        .sort((a, b) => a.mileage - b.mileage);
    const latest = sorted.at(-1);
    const previous = sorted.at(-2);
    const lastDistance = latest && previous ? calculateDistance(previous.mileage, latest.mileage) : null;

    const completedIntervals: IntervalConsumption[] = [];
    let baselineIndex: number | null = null;
    for (let index = 0; index < sorted.length; index += 1) {
        if (!sorted[index].fullTank) continue;
        if (baselineIndex !== null) {
            const interval = calculateIntervalConsumption(sorted.slice(baselineIndex, index + 1));
            if (interval) completedIntervals.push(interval);
        }
        baselineIndex = index;
    }

    const completedDistance = completedIntervals.reduce((sum, interval) => sum + interval.distance, 0);
    const totalFuel = completedIntervals.reduce((sum, interval) => sum + interval.liters, 0);
    const totalCost = completedIntervals.reduce((sum, interval) => sum + interval.cost, 0);
    const lastInterval = latest?.fullTank ? completedIntervals.at(-1) ?? null : null;
    const totalDistance = sorted.length >= 2
        ? calculateDistance(sorted[0].mileage, sorted.at(-1)!.mileage) ?? 0
        : 0;

    return {
        recordCount: sorted.length,
        totalDistance,
        totalFuel,
        totalCost,
        totalPaid: sorted.reduce((sum, record) => sum + record.price, 0),
        averageConsumption: completedDistance > 0 ? totalFuel / completedDistance * 100 : null,
        averageCostPerKm: calculateCostPerKm(totalCost, completedDistance),
        averageCostPer100Km: calculateCostPer100Km(totalCost, completedDistance),
        lastDistance,
        lastLiters: latest?.liters ?? null,
        lastConsumption: lastInterval?.consumption ?? null,
        lastCostPerKm: lastInterval?.costPerKm ?? null,
        lastCostPer100Km: lastInterval?.costPer100Km ?? null,
    };
}

export type RecordMetrics = {
    distance: number | null;
    consumption: number | null;
};

export function calculateRecordMetrics(records: FuelRecord[]): Map<string, RecordMetrics> {
    const sorted = [...records].sort((a, b) => a.mileage - b.mileage);
    const result = new Map<string, RecordMetrics>();
    let fullTankIndex: number | null = null;

    sorted.forEach((record, index) => {
        const distance = index > 0 ? calculateDistance(sorted[index - 1].mileage, record.mileage) : null;
        let consumption: number | null = null;
        if (record.fullTank) {
            if (fullTankIndex !== null) {
                consumption = calculateIntervalConsumption(sorted.slice(fullTankIndex, index + 1))?.consumption ?? null;
            }
            fullTankIndex = index;
        }
        result.set(record.id, { distance, consumption });
    });

    return result;
}
