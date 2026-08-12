import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiSession } from '@/lib/auth';

export async function GET(request: Request) {
    const authError = await requireApiSession(request);
    if (authError) return authError;

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
