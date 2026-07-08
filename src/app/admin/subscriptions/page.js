'use client';

import { useEffect, useState } from 'react';
import { subscriptionApi } from '@/lib/api';
import DataTable from '@/components/DataTable';

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [tab, setTab] = useState('subscriptions'); // subscriptions | plans | payments
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // assign plan: { shopId, planId, expiry }
  const [assignShopId, setAssignShopId] = useState('');
  const [assignPlanId, setAssignPlanId] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [subs, plansRes, payRes] = await Promise.allSettled([
        subscriptionApi.get('/subscriptions').then((d) => Array.isArray(d) ? d : d?.content ?? []),
        subscriptionApi.get('/plans').then((d) => Array.isArray(d) ? d : d?.content ?? []),
        subscriptionApi.get('/payments').then((d) => Array.isArray(d) ? d : d?.content ?? []),
      ]);
      setSubscriptions(subs.status === 'fulfilled' ? subs.value : []);
      setPlans(plansRes.status === 'fulfilled' ? plansRes.value : []);
      setPayments(payRes.status === 'fulfilled' ? payRes.value : []);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAssign = () => {
    setModal('assign');
    setAssignShopId('');
    setAssignPlanId('');
    setExpiryDate('');
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignShopId || !assignPlanId) return;
    setSubmitting(true);
    try {
      await subscriptionApi.post('/subscriptions', {
        shopId: assignShopId,
        planId: assignPlanId,
        expiresAt: expiryDate || undefined,
      });
      setModal(null);
      load();
    } catch (e) {
      setError(e.body?.message || e.message || 'Assign failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateExpiry = async (sub, newExpiry) => {
    try {
      await subscriptionApi.patch(`/subscriptions/${sub.id}`, { expiresAt: newExpiry });
      load();
    } catch (e) {
      setError(e.body?.message || e.message || 'Update failed');
    }
  };

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Subscription Management</h1>
        <button
          type="button"
          onClick={openAssign}
          className="rounded-lg bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Assign plan to shop
        </button>
      </div>
      <p className="text-admin-muted text-sm mb-4">
        Assign plans to shops, manage expiry, and view payments.
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 border-b border-admin-border mb-4">
        {['subscriptions', 'plans', 'payments'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'text-admin-accent border-b-2 border-admin-accent' : 'text-admin-muted hover:text-slate-800'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-admin-muted">Loading…</p>
      ) : tab === 'subscriptions' ? (
        <DataTable
          columns={[
            { key: 'shopId', label: 'Shop ID', render: (r) => r.shopId ?? r.shop?.name ?? r.shopId ?? '—' },
            { key: 'planId', label: 'Plan', render: (r) => plans.find((p) => p.id === (r.planId ?? r.plan?.id))?.name ?? r.planId ?? '—' },
            {
              key: 'expiresAt',
              label: 'Expires',
              render: (r) => {
                const ex = r.expiresAt ?? r.expires_at ?? r.endDate;
                return ex ? new Date(ex).toLocaleDateString() : '—';
              },
            },
            {
              key: 'status',
              label: 'Status',
              render: (r) => (
                <span className={r.status === 'ACTIVE' ? 'text-emerald-400' : 'text-admin-muted'}>
                  {r.status ?? '—'}
                </span>
              ),
            },
          ]}
          rows={subscriptions}
          emptyMessage="No subscriptions."
        />
      ) : tab === 'plans' ? (
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'code', label: 'Code', render: (r) => r.code ?? '—' },
            { key: 'price', label: 'Price', render: (r) => (r.price != null ? `$${r.price}` : '—') },
          ]}
          rows={plans}
          emptyMessage="No plans defined."
        />
      ) : (
        <DataTable
          columns={[
            { key: 'subscriptionId', label: 'Subscription', render: (r) => r.subscriptionId ?? r.subscription?.id ?? '—' },
            { key: 'amount', label: 'Amount', render: (r) => (r.amount != null ? `$${r.amount}` : '—') },
            { key: 'status', label: 'Status' },
            { key: 'paidAt', label: 'Paid', render: (r) => (r.paidAt ?? r.paid_at ? new Date(r.paidAt ?? r.paid_at).toLocaleString() : '—') },
          ]}
          rows={payments}
          emptyMessage="No payments."
        />
      )}

      {modal === 'assign' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-admin-card border border-admin-border p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Assign plan to shop</h2>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm text-admin-muted mb-1">Shop ID</label>
                <input
                  type="text"
                  value={assignShopId}
                  onChange={(e) => setAssignShopId(e.target.value)}
                  placeholder="UUID or slug"
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Plan</label>
                <select
                  value={assignPlanId}
                  onChange={(e) => setAssignPlanId(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  required
                >
                  <option value="">Select plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name ?? p.code ?? p.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Expiry date (optional)</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setModal(null)} className="rounded-lg px-4 py-2 text-slate-600 hover:bg-admin-dark">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-lg bg-admin-accent px-4 py-2 text-white disabled:opacity-50">
                  {submitting ? 'Saving…' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
