import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
