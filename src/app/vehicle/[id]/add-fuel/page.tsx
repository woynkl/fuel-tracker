"use client";

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AddFuelForm } from '@/components/AddFuelForm';
import { Button } from '@/components/ui/Button';

export default function AddFuelPage() {
    const router = useRouter();
    const params = useParams();
    const id = params.id as string;

    const handleSuccess = () => {
        router.push('/');
        router.refresh();
    };

    const handleCancel = () => {
        router.back();
    };

    return (
        <main className="layout-container form-page">
            <header className="form-header">
                <div>
                    <Button variant="ghost" onClick={handleCancel} className="mb-2 pl-0">
                        ← 返回
                    </Button>
                    <h1>记录加油</h1>
                    <p className="text-muted">填写金额与油价，升数会自动计算</p>
                </div>
            </header>

            <div className="md-card form-card">
                <AddFuelForm
                    vehicleId={id}
                    onSuccess={handleSuccess}
                    onCancel={handleCancel}
                />
            </div>
        </main>
    );
}
