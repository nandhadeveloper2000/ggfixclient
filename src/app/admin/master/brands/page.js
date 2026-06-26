'use client';

import { useEffect, useState } from 'react';
import { masterApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import ImageUpload from '@/components/ImageUpload';

export default function MasterBrandsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { type: 'create' | 'edit', item?: {} }
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await masterApi.get('/master/brands');
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
    setName('');
    setImageUrl('');
  };
  const openEdit = (item) => {
    setModal({ type: 'edit', item });
    setName(item.name || '');
    setImageUrl(item.imageUrl || '');
  };
  const closeModal = () => setModal(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (modal.type === 'create') {
        await masterApi.post('/master/brands', { name: name.trim(), imageUrl: imageUrl.trim() || null });
      } else {
        await masterApi.put(`/master/brands/${modal.item.id}`, {
          name: name.trim(),
          imageUrl: imageUrl.trim() || null,
        });
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
    if (!confirm('Delete this brand? Models under it may need to be removed first.')) return;
    try {
      await masterApi.delete(`/master/brands/${row.id}`);
      load();
    } catch (e) {
      setError(e.body?.message || e.message || 'Delete failed');
    }
  };

  const columns = [
    {
      key: 'imageUrl',
      label: 'Logo',
      render: (r) =>
        r.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.imageUrl}
            alt={r.name || 'brand'}
            className="h-10 w-10 rounded-md object-contain bg-white p-0.5"
          />
        ) : (
          <div className="h-10 w-10 rounded-md bg-admin-dark border border-admin-border flex items-center justify-center text-[10px] text-admin-muted">
            no logo
          </div>
        ),
    },
    { key: 'name', label: 'Name' },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Mobile Brands</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Add brand
        </button>
      </div>
      <p className="text-admin-muted text-sm mb-4">
        These brands drive the mobile app dropdown (GET /api/master/brands). Add or edit here to update app options.
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
          emptyMessage="No brands. Add one to show in mobile app dropdowns."
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-admin-card border border-admin-border p-6">
            <h2 className="text-lg font-medium text-slate-100 mb-4">
              {modal.type === 'create' ? 'New brand' : 'Edit brand'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-admin-muted mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                  required
                />
              </div>
              <ImageUpload
                value={imageUrl}
                onChange={setImageUrl}
                label="Brand logo"
                caption="Shown in customer brand picker (e.g. Apple, Vivo, Samsung)"
                folder="brands"
                buttonText="Upload Brand Logo"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 text-slate-300 hover:bg-admin-dark">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-admin-accent px-4 py-2 text-white disabled:opacity-50"
                >
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
