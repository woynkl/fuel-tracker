import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApiSession } from '@/lib/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const authError = await requireApiSession(request);
    if (authError) return authError;

    const { id } = await params;
    try {
        const vehicle = await prisma.vehicle.findUnique({ where: { id } });
        if (!vehicle) return NextResponse.json({ error: '车辆不存在' }, { status: 404 });
        return NextResponse.json(vehicle);
    } catch (error) {
        console.error('读取车辆失败', error);
        return NextResponse.json({ error: '读取车辆失败' }, { status: 500 });
    }
}
