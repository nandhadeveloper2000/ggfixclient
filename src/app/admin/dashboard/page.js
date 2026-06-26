'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { masterApi, shopApi, subscriptionApi } from '@/lib/api';

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    brands: 0,
    models: 0,
    shops: 0,
    subscriptions: 0,
    error: null,
  });

  useEffect(() => {
    const run = async () => {
      try {
        const [brands, models, shops, subs] = await Promise.allSettled([
          masterApi.get('/master/brands').then((d) => (Array.isArray(d) ? d.length : d?.length ?? 0)),
          masterApi.get('/master/brands').then(async (brands) => {
            const list = Array.isArray(brands) ? brands : brands?.content ?? [];
            let total = 0;
            for (const b of list.slice(0, 20)) {
              const id = b.id ?? b.brandId;
              if (id) {
                const m = await masterApi.get(`/master/brands/${id}/models`).catch(() => []);
                total += Array.isArray(m) ? m.length : 0;
              }
            }
            return total;
          }),
          shopApi.get('/shops').then((d) => (Array.isArray(d) ? d.length : d?.content?.length ?? d?.total ?? 0)),
          subscriptionApi.get('/subscriptions').then((d) => (Array.isArray(d) ? d.length : d?.content?.length ?? d?.total ?? 0)),
        ]);
        setStats({
          brands: brands.status === 'fulfilled' ? brands.value : 0,
          models: models.status === 'fulfilled' ? models.value : '-',
          shops: shops.status === 'fulfilled' ? shops.value : 0,
          subscriptions: subs.status === 'fulfilled' ? subs.value : 0,
          error: null,
        });
      } catch (e) {
        setStats((s) => ({ ...s, error: e.message }));
      }
    };
    run();
  }, []);

  const cards = [
    { title: 'Shops', value: stats.shops, href: '/admin/shops', color: 'bg-sky-500/20 text-sky-400' },
    { title: 'Subscriptions', value: stats.subscriptions, href: '/admin/subscriptions', color: 'bg-emerald-500/20 text-emerald-400' },
    { title: 'Brands', value: stats.brands, href: '/admin/master/brands', color: 'bg-amber-500/20 text-amber-400' },
    { title: 'Models (sample)', value: stats.models, href: '/admin/master/models', color: 'bg-violet-500/20 text-violet-400' },
  ];

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-semibold text-slate-100 mb-6">Dashboard</h1>
      {stats.error && (
        <p className="mb-4 text-sm text-red-400">
          Some data could not be loaded. Check backend URLs in .env.local. {stats.error}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl border border-admin-border bg-admin-card p-5 hover:border-admin-accent/50 transition-colors"
          >
            <p className="text-sm text-admin-muted mb-1">{c.title}</p>
            <p className={`text-2xl font-semibold ${c.color}`}>{c.value}</p>
          </Link>
        ))}
      </div>
      <div className="rounded-xl border border-admin-border bg-admin-card p-6">
        <h2 className="text-lg font-medium text-slate-100 mb-3">Quick links</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/admin/shops/new" className="text-admin-accent hover:underline">
              Create shop
            </Link>
          </li>
          <li>
            <Link href="/admin/master/brands" className="text-admin-accent hover:underline">
              Manage brands (used in mobile app dropdowns)
            </Link>
          </li>
          <li>
            <Link href="/admin/master/models" className="text-admin-accent hover:underline">
              Manage models (by brand)
            </Link>
          </li>
          <li>
            <Link href="/admin/master/repair-services" className="text-admin-accent hover:underline">
              Manage repair services
            </Link>
          </li>
          <li>
            <Link href="/admin/subscriptions" className="text-admin-accent hover:underline">
              Subscriptions & payments
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
