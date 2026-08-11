import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const record = await prisma.fuelRecord.findUnique({ where: { id } });
        if (!record) return NextResponse.json({ error: '记录不存在' }, { status: 404 });

        await prisma.$transaction(async transaction => {
            await transaction.fuelRecord.delete({ where: { id } });
            const latest = await transaction.fuelRecord.findFirst({
                where: { vehicleId: record.vehicleId },
                orderBy: { mileage: 'desc' },
            });
            await transaction.vehicle.update({
                where: { id: record.vehicleId },
                data: { odometer: latest?.mileage ?? 0 },
            });
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('删除加油记录失败', error);
        return NextResponse.json({ error: '删除失败，请稍后重试' }, { status: 500 });
    }
}
