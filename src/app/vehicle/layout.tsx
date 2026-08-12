import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';

export default async function VehicleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    if (!(await requireSession())) redirect('/login');
    return children;
}
