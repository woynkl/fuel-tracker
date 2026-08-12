"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

export function LogoutButton() {
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);

    const logout = async () => {
        setSubmitting(true);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
            router.replace('/login');
            router.refresh();
        }
    };

    return (
        <Button variant="ghost" onClick={logout} disabled={submitting}>
            {submitting ? '退出中…' : '退出'}
        </Button>
    );
}
