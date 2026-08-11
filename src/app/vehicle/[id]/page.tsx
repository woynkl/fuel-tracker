import { redirect } from 'next/navigation';

type Props = {
    params: Promise<{ id: string }>;
};

export default async function VehiclePage({ params }: Props) {
    await params;
    redirect('/');
}
