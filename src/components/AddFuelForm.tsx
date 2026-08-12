import React, { useState } from 'react';
import { Button } from './ui/Button';
import { MaterialInput } from './ui/MaterialInput';
import { calculateLiters } from '@/lib/fuel';
import { getLocalRepository } from '@/lib/storage/client';

type AddFuelFormProps = {
    onSuccess: () => void;
    onCancel: () => void;
};

const localDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export function AddFuelForm({ onSuccess, onCancel }: AddFuelFormProps) {
    const [formData, setFormData] = useState({
        mileage: '',
        price: '',
        unitPrice: '',
        fullTank: true,
        date: localDate(),
    });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const estimatedLiters = calculateLiters(Number(formData.price), Number(formData.unitPrice));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await getLocalRepository().addFuelRecord({
                mileage: Number(formData.mileage),
                amount: Number(formData.price),
                unitPrice: Number(formData.unitPrice),
                fullTank: formData.fullTank,
                date: `${formData.date}T00:00:00.000Z`,
            });
            onSuccess();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="animate-fade-in pb-4">
            <MaterialInput
                id="mileage"
                label="当前表显公里数（km）"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                required
                value={formData.mileage}
                onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
            />

            <MaterialInput id="price" label="加油金额（元）" type="number" inputMode="decimal" min="0.01" step="0.01" required value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
            <MaterialInput id="unitPrice" label="当前油价（元/L）" type="number" inputMode="decimal" min="0.01" step="0.01" required value={formData.unitPrice} onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })} />

            <div className="liters-preview" aria-live="polite">
                预计加油 <strong>{estimatedLiters === null ? '--' : estimatedLiters.toFixed(2)} L</strong>
            </div>

            <label className="tank-toggle" htmlFor="fullTank">
                <input
                    type="checkbox"
                    id="fullTank"
                    checked={formData.fullTank}
                    onChange={(e) => setFormData({ ...formData, fullTank: e.target.checked })}
                />
                <span><strong>本次加满</strong><small>准确油耗需要在两次加满之间计算</small></span>
            </label>

            <MaterialInput id="date" label="日期" type="date" required value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />

            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="form-actions">
                <Button type="button" variant="ghost" onClick={onCancel}>取消</Button>
                <Button type="submit" disabled={saving}>{saving ? '保存中…' : '保存记录'}</Button>
            </div>
        </form>
    );
}
