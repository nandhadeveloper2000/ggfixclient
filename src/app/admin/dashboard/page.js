'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Store, CheckCircle2, XCircle, Tag, Briefcase, Boxes } from 'lucide-react';
import { masterApi, authApi } from '@/lib/api';
import PageHeader from '@/components/PageHeader';

const asArray = (d) => (Array.isArray(d) ? d : d?.content ?? []);

function StatCard({ title, value, href, icon: Icon, iconBg, iconText }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-admin-border bg-admin-card p-5 shadow-sm transition-all hover:border-admin-accent/50 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconText}`} />
        </div>
        <div>
          <p className="text-sm text-admin-muted">{title}</p>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    shopsTotal: 0,
    shopsActive: 0,
    shopsInactive: 0,
    categories: 0,
    brands: 0,
    models: 0,
    error: null,
  });

  useEffect(() => {
    const run = async () => {
      try {
        const [shopsR, catsR, brandsR] = await Promise.allSettled([
          authApi.get('/auth/shops'), // has isActive/status (shop-service /shops does not)
          masterApi.get('/master/device-categories'),
          masterApi.get('/master/brands'),
        ]);

        const shops = shopsR.status === 'fulfilled' ? asArray(shopsR.value) : [];
        const cats = catsR.status === 'fulfilled' ? asArray(catsR.value) : [];
        const brands = brandsR.status === 'fulfilled' ? asArray(brandsR.value) : [];

        // Models have no list-all endpoint — sum across every brand.
        const perBrand = await Promise.all(
          brands.map((b) => {
            const id = b.id ?? b.brandId;
            return id
              ? masterApi.get(`/master/brands/${id}/models`).then((m) => asArray(m).length).catch(() => 0)
              : 0;
          })
        );
        const models = perBrand.reduce((a, n) => a + n, 0);

        const total = shops.length;
        const active = shops.filter(
          (s) => s.isActive === true || s.active === true || s.status === 'ACTIVE'
        ).length;

        setStats({
          shopsTotal: total,
          shopsActive: active,
          shopsInactive: total - active,
          categories: cats.length,
          brands: brands.length,
          models,
          error: null,
        });
      } catch (e) {
        setStats((s) => ({ ...s, error: e.message }));
      }
    };
    run();
  }, []);

  return (
    <div className="p-6 md:p-8">
      <PageHeader breadcrumb={['Dashboard']} title="Dashboard" subtitle="Overview of your platform." />

      {stats.error && (
        <p className="mb-4 text-sm text-red-600">
          Some data could not be loaded. Check backend URLs in .env.local. {stats.error}
        </p>
      )}

      {/* Shops */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Shops</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Total Shops" value={stats.shopsTotal} href="/admin/shops" icon={Store} iconBg="bg-sky-100" iconText="text-sky-600" />
          <StatCard title="Active Shops" value={stats.shopsActive} href="/admin/shops" icon={CheckCircle2} iconBg="bg-emerald-100" iconText="text-emerald-600" />
          <StatCard title="Inactive Shops" value={stats.shopsInactive} href="/admin/shops" icon={XCircle} iconBg="bg-rose-100" iconText="text-rose-600" />
        </div>
      </section>

      {/* Master Data */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Master Data</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Categories" value={stats.categories} href="/admin/master/device-categories" icon={Tag} iconBg="bg-violet-100" iconText="text-violet-600" />
          <StatCard title="Brands" value={stats.brands} href="/admin/master/brands" icon={Briefcase} iconBg="bg-amber-100" iconText="text-amber-600" />
          <StatCard title="Models" value={stats.models} href="/admin/master/models" icon={Boxes} iconBg="bg-indigo-100" iconText="text-indigo-600" />
        </div>
      </section>
    </div>
  );
}
