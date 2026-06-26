'use client';

import { useEffect, useState } from 'react';
import { masterApi } from '@/lib/api';
import DataTable from '@/components/DataTable';

export default function DirectoryBannersPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkTarget, setLinkTarget] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await masterApi.get('/master/banners');
      setList(Array.isArray(data) ? data : data?.content ?? []);
    } catch (e) {
      setError(e.message || 'Failed to load');
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setModal({ type: 'create' });
    setTitle('');
    setImageUrl('');
    setLinkTarget('');
    setSortOrder('0');
    setIsActive(true);
  };
  const openEdit = (item) => {
    setModal({ type: 'edit', item });
    setTitle(item.title || '');
    setImageUrl(item.imageUrl || '');
    setLinkTarget(item.linkTarget || '');
    setSortOrder(String(item.sortOrder ?? 0));
    setIsActive(item.isActive ?? true);
  };
  const closeModal = () => setModal(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        imageUrl: imageUrl.trim() || null,
        linkTarget: linkTarget.trim() || null,
        sortOrder: parseInt(sortOrder, 10) || 0,
        isActive,
      };
      if (modal.type === 'create') {
        await masterApi.post('/master/banners', body);
      } else {
        await masterApi.put(`/master/banners/${modal.item.id}`, body);
      }
      closeModal();
      load();
    } catch (e) {
      setError(e.body?.message || e.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row) => {
    if (!confirm('Delete this banner?')) return;
    try {
      await masterApi.delete(`/master/banners/${row.id}`);
      load();
    } catch (e) {
      setError(e.body?.message || e.message || 'Delete failed');
    }
  };

  const columns = [
    {
      key: 'imageUrl',
      label: 'Image',
      render: (r) =>
        r.imageUrl ? (
          <img src={r.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />
        ) : (
          '—'
        ),
    },
    { key: 'title', label: 'Title' },
    { key: 'linkTarget', label: 'Link', render: (r) => r.linkTarget || '—' },
    { key: 'sortOrder', label: 'Sort', render: (r) => r.sortOrder ?? 0 },
    { key: 'isActive', label: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Banners</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Add banner
        </button>
      </div>
      <p className="text-admin-muted text-sm mb-4">
        Promotional banners shown in the mobile app (GET /api/master/banners).
      </p>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-admin-muted">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={list}
          onEdit={openEdit}
          onDelete={handleDelete}
          emptyMessage="No banners."
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-admin-card border border-admin-border p-6">
            <h2 className="text-lg font-medium text-slate-100 mb-4">
              {modal.type === 'create' ? 'New banner' : 'Edit banner'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-admin-muted mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Image URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Link target</label>
                <input
                  type="text"
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                  placeholder="/route or https://…"
                />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Sort order</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 text-slate-300 hover:bg-admin-dark">Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-lg bg-admin-accent px-4 py-2 text-white disabled:opacity-50">
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
