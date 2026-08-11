"use client";

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { MaterialInput } from '@/components/ui/MaterialInput';

export default function LoginPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok) {
                setError(result?.error ?? '登录失败，请稍后重试');
                return;
            }
            router.replace('/');
            router.refresh();
        } catch {
            setError('网络异常，请稍后重试');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="login-page">
            <section className="md-card login-card">
                <p className="eyebrow">个人油耗记录</p>
                <h1>油耗记录</h1>
                <form onSubmit={submit}>
                    <MaterialInput
                        id="password"
                        label="密码"
                        type="password"
                        autoComplete="current-password"
                        autoFocus
                        required
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                    />
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <Button className="login-button" type="submit" disabled={submitting}>
                        {submitting ? '登录中…' : '登录'}
                    </Button>
                </form>
            </section>
        </main>
    );
}
