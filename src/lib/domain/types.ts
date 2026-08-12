export type DomainDate = Date | string;

export type Vehicle<TDate extends DomainDate = DomainDate> = {
    id: string;
    name: string;
    type: string;
    odometer: number;
    createdAt: TDate;
    updatedAt: TDate;
};

export type FuelRecord<TDate extends DomainDate = DomainDate> = {
    id: string;
    vehicleId: string;
    date: TDate;
    mileage: number;
    liters: number;
    price: number;
    unitPrice: number;
    fullTank: boolean;
    station: string | null;
    createdAt: TDate;
    updatedAt: TDate;
};

export type BackupPayload = {
    schemaVersion: 1;
    exportedAt: string;
    vehicle: Vehicle<string>;
    fuelRecords: FuelRecord<string>[];
};
