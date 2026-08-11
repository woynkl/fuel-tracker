import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        let vehicle = await prisma.vehicle.findFirst({ orderBy: { createdAt: 'asc' } });
        if (!vehicle) {
            vehicle = await prisma.vehicle.create({ data: { name: '我的车', type: 'car', odometer: 0 } });
        }
        return NextResponse.json(vehicle);
    } catch {
        return NextResponse.json({ error: 'Failed to fetch vehicles' }, { status: 500 });
    }
}
