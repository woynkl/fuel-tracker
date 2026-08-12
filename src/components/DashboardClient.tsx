"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { calculateConsumption, calculateRecordMetrics } from '@/lib/fuel';
import { getLocalRepository } from '@/lib/storage/client';
import type { StoredFuelRecord, StoredVehicle } from '@/lib/storage/repository';
import { Button } from '@/components/ui/Button';

const number = (value: number | null, digits = 2) => value === null ? '--' : value.toFixed(digits);

export function DashboardClient() {
    const router = useRouter();
    const [vehicle, setVehicle] = useState<StoredVehicle | null>(null);
    const [records, setRecords] = useState<StoredFuelRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [storageError, setStorageError] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null);
    const stats = useMemo(() => calculateConsumption(records), [records]);
    const metrics = useMemo(() => calculateRecordMetrics(records), [records]);
    const historyRecords = useMemo(() => [...records].sort((a, b) => b.mileage - a.mileage), [records]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setStorageError('');
        try {
            const repository = getLocalRepository();
            await repository.initialize();
            const [storedVehicle, storedRecords] = await Promise.all([
                repository.getVehicle(),
                repository.listFuelRecords(),
            ]);
            if (!storedVehicle) throw new Error('无法初始化本地车辆数据');
            setVehicle(storedVehicle);
            setRecords(storedRecords);
        } catch (error) {
            setStorageError(error instanceof Error ? error.message : '无法读取本地数据');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const deleteRecord = async (id: string) => {
        if (!window.confirm('确定删除这条加油记录吗？删除后统计会自动重算。')) return;
        setDeleting(id);
        try {
            const repository = getLocalRepository();
            const deleted = await repository.deleteFuelRecord(id);
            if (!deleted) throw new Error('记录不存在或已被删除');
            const [storedVehicle, storedRecords] = await Promise.all([
                repository.getVehicle(),
                repository.listFuelRecords(),
            ]);
            if (!storedVehicle) throw new Error('无法读取本地车辆数据');
            setVehicle(storedVehicle);
            setRecords(storedRecords);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : '删除失败，请稍后重试');
        } finally {
            setDeleting(null);
        }
    };

    if (loading) {
        return <main className="layout-container"><div className="empty-state" role="status">正在读取本地数据…</div></main>;
    }

    if (storageError || !vehicle) {
        return (
            <main className="layout-container form-page">
                <section className="md-card storage-error" role="alert">
                    <h1>无法读取本地数据</h1>
                    <p>{storageError || '本地车辆数据不存在'}</p>
                    <Button onClick={() => void loadData()}>重试</Button>
                </section>
            </main>
        );
    }

    return (
        <main className="layout-container dashboard">
            <header className="dashboard-header">
                <div>
                    <p className="eyebrow">个人油耗记录</p>
                    <h1>{vehicle.name}</h1>
                    <p className="text-muted">当前表显 {vehicle.odometer.toLocaleString('zh-CN')} km</p>
                </div>
                <div className="header-actions">
                    <Button className="add-button" onClick={() => router.push('/add-fuel')}>
                        ＋ 记录加油
                    </Button>
                    <div className="header-secondary-actions">
                        <Button variant="ghost" onClick={() => router.push('/settings/data')}>数据管理</Button>
                    </div>
                </div>
            </header>

            <section className="hero-card" aria-label="平均油耗">
                <p>累计平均油耗</p>
                <div className="hero-number">{number(stats.averageConsumption)}</div>
                <strong>L / 100km</strong>
                {stats.recordCount < 2 && <p className="hint">再记录一次加油即可计算油耗</p>}
            </section>

            <section className="stats-grid" aria-label="油耗统计">
                <article className="stat-card"><span>本次行驶</span><strong>{number(stats.lastDistance, 0)} <small>km</small></strong></article>
                <article className="stat-card"><span>本次油耗</span><strong>{number(stats.lastConsumption)} <small>L/100km</small></strong></article>
                <article className="stat-card"><span>百公里油费</span><strong>{stats.lastCostPer100Km === null ? '--' : `¥${number(stats.lastCostPer100Km)}`}</strong></article>
                <article className="stat-card"><span>每公里</span><strong>{stats.lastCostPerKm === null ? '--' : `¥${number(stats.lastCostPerKm)}`}</strong></article>
                <article className="stat-card"><span>累计行驶</span><strong>{stats.totalDistance.toLocaleString('zh-CN')} <small>km</small></strong></article>
                <article className="stat-card"><span>累计加油</span><strong>¥{stats.totalPaid.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></article>
            </section>

            <section className="history-section">
                <div className="section-heading">
                    <h2>历史记录</h2>
                    <span>累计 {records.length} 次</span>
                </div>
                {records.length === 0 ? (
                    <div className="empty-state">还没有加油记录，点击上方按钮开始记录。</div>
                ) : (
                    <div className="record-list">
                        {historyRecords.map(record => {
                            const recordMetrics = metrics.get(record.id);
                            return (
                                <article className="record-card" key={record.id}>
                                    <div className="record-topline">
                                        <div>
                                            <time>{new Date(record.date).toLocaleDateString('zh-CN')}</time>
                                            <span className={record.fullTank ? 'tank-badge full' : 'tank-badge'}>{record.fullTank ? '已加满' : '未加满'}</span>
                                        </div>
                                        <button className="delete-button" disabled={deleting === record.id} onClick={() => deleteRecord(record.id)}>
                                            {deleting === record.id ? '删除中…' : '删除'}
                                        </button>
                                    </div>
                                    <div className="record-mileage">{record.mileage.toLocaleString('zh-CN')} <small>km</small></div>
                                    <dl className="record-details">
                                        <div><dt>金额</dt><dd>¥{record.price.toFixed(2)}</dd></div>
                                        <div><dt>油价</dt><dd>¥{record.unitPrice.toFixed(2)}/L</dd></div>
                                        <div><dt>加油</dt><dd>{record.liters.toFixed(2)} L</dd></div>
                                        <div><dt>本段行驶</dt><dd>{recordMetrics?.distance == null ? '--' : `${recordMetrics.distance} km`}</dd></div>
                                        <div className="wide"><dt>周期油耗</dt><dd>{recordMetrics?.consumption == null ? '--' : `${recordMetrics.consumption.toFixed(2)} L/100km`}</dd></div>
                                    </dl>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
