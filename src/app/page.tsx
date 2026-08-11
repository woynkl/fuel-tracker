import { DashboardClient } from '@/components/DashboardClient';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let vehicle = await prisma.vehicle.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!vehicle) {
    vehicle = await prisma.vehicle.create({
      data: { name: '我的车', type: 'car', odometer: 0 },
    });
  }

  const records = await prisma.fuelRecord.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ mileage: 'desc' }, { date: 'desc' }],
  });

  return <DashboardClient vehicle={vehicle} initialRecords={records} />;
}
