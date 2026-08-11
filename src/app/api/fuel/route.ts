import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculateLiters } from '@/lib/fuel';
import { isJsonRequest, requireApiSession, validateSameOrigin } from '@/lib/auth';

export async function GET(request: Request) {
    const authError = await requireApiSession(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('vehicleId');

    if (!vehicleId) {
        return NextResponse.json({ error: 'Vehicle ID required' }, { status: 400 });
    }

    try {
        const records = await prisma.fuelRecord.findMany({
            where: { vehicleId },
            orderBy: [{ date: 'desc' }, { mileage: 'desc' }],
        });
        return NextResponse.json(records);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const authError = await requireApiSession(request);
    if (authError) return authError;
    if (!validateSameOrigin(request)) {
        return NextResponse.json({ error: '不允许跨站写入' }, { status: 403 });
    }
    if (!isJsonRequest(request)) {
        return NextResponse.json({ error: 'Content-Type 必须是 application/json' }, { status: 415 });
    }

    try {
        const body = await request.json();
        const mileage = Number(body.mileage);
        const price = Number(body.price);
        const unitPrice = Number(body.unitPrice);
        const liters = calculateLiters(price, unitPrice);
        const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
            ? new Date(`${body.date}T12:00:00.000Z`)
            : new Date(Number.NaN);

        if (!body.vehicleId || !Number.isInteger(mileage) || mileage <= 0) {
            return NextResponse.json({ error: '当前表显公里数必须是大于 0 的整数' }, { status: 400 });
        }
        if (!Number.isFinite(price) || price <= 0) {
            return NextResponse.json({ error: '加油金额必须大于 0' }, { status: 400 });
        }
        if (!Number.isFinite(unitPrice) || unitPrice <= 0 || liters === null) {
            return NextResponse.json({ error: '当前油价必须大于 0' }, { status: 400 });
        }
        if (Number.isNaN(date.getTime())) {
            return NextResponse.json({ error: '请选择有效日期' }, { status: 400 });
        }

        const vehicle = await prisma.vehicle.findUnique({ where: { id: body.vehicleId } });
        if (!vehicle) return NextResponse.json({ error: '车辆不存在' }, { status: 400 });

        const latest = await prisma.fuelRecord.findFirst({
            where: { vehicleId: body.vehicleId },
            orderBy: { mileage: 'desc' },
        });
        if (latest && mileage <= latest.mileage) {
            return NextResponse.json(
                { error: `当前里程必须大于上一条记录的 ${latest.mileage} km` },
                { status: 400 },
            );
        }

        const record = await prisma.$transaction(async transaction => {
            const created = await transaction.fuelRecord.create({
                data: {
                    vehicleId: body.vehicleId,
                    mileage,
                    liters,
                    price,
                    unitPrice,
                    fullTank: body.fullTank !== false,
                    date,
                },
            });
            await transaction.vehicle.update({
                where: { id: body.vehicleId },
                data: { odometer: mileage },
            });
            return created;
        });

        return NextResponse.json(record, { status: 201 });
    } catch (error) {
        console.error('保存加油记录失败', error);
        return NextResponse.json({ error: '保存失败，请稍后重试' }, { status: 500 });
    }
}
