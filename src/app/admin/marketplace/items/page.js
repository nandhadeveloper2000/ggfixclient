'use client';

import { useEffect, useState } from 'react';
import { masterApi } from '@/lib/api';
import DataTable from '@/components/DataTable';

// In a later step, you can swap this to a dedicated marketplaceApi exported from lib/api.
const productsApi = {
  get: (path) => masterApi.get(path),
  post: (path, body) => masterApi.post(path, body),
  put: (path, body) => masterApi.put(path, body),
  delete: (path) => masterApi.delete(path),
};

export default function MarketplaceItemsPage() {
  const [items, setItems] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(null); // { type: 'create' | 'edit', item? }
  const [title, setTitle] = useState('');
  const [type, setType] = useState('DEVICE');
  const [brandId, setBrandId] = useState('');
  const [modelId, setModelId] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadBrands = async () => {
    try {
      const data = await masterApi.get('/master/brands');
      setBrands(Array.isArray(data) ? data : data?.content ?? []);
    } catch {
      setBrands([]);
    }
  };

  const loadModels = async () => {
    try {
      const data = await masterApi.get('/master/brands');
      const brandList = Array.isArray(data) ? data : data?.content ?? [];
      const all = [];
      for (const b of brandList) {
        const id = b.id ?? b.brandId;
        if (!id) continue;
        const models = await masterApi.get(`/master/brands/${id}/models`).catch(() => []);
        const arr = Array.isArray(models) ? models : [];
        all.push(...arr.map((m) => ({ ...m, brandId: id, brandName: b.name })));
      }
      setModels(all);
    } catch {
      setModels([]);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await productsApi.get('/marketplace/products');
      setItems(Array.isArray(data) ? data : data?.content ?? []);
    } catch (e) {
      setError(e.message || 'Failed to load marketplace items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrands();
    loadModels();
    loadItems();
  }, []);

  const openCreate = () => {
    setModal({ type: 'create' });
    setTitle('');
    setType('DEVICE');
    setBrandId(brands[0]?.id ?? '');
    setModelId('');
    setPrice('');
    setStatus('ACTIVE');
    setImageUrl('');
  };

  const openEdit = (item) => {
    setModal({ type: 'edit', item });
    setTitle(item.title || '');
    setType(item.type || 'DEVICE');
    setBrandId(item.brandId || '');
    setModelId(item.modelId || '');
    setPrice(item.price != null ? String(item.price) : '');
    setStatus(item.status || 'ACTIVE');
    setImageUrl(item.imageUrl || '');
  };

  const closeModal = () => setModal(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !brandId || !modelId) return;
    setSubmitting(true);
    setError('');
    const body = {
      title: title.trim(),
      type,
      brandId,
      modelId,
      price: Number(price) || 0,
      status,
      imageUrl: imageUrl.trim() || null,
    };
    try {
      if (modal.type === 'create') {
        await productsApi.post('/marketplace/products', body);
      } else {
        await productsApi.put(`/marketplace/products/${modal.item.id}`, body);
      }
      closeModal();
      loadItems();
    } catch (e) {
      setError(e.body?.message || e.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row) => {
    if (!confirm('Delete this marketplace item?')) return;
    try {
      await productsApi.delete(`/marketplace/products/${row.id}`);
      loadItems();
    } catch (e) {
      setError(e.body?.message || e.message || 'Delete failed');
    }
  };

  const getBrandName = (id) =>
    brands.find((b) => (b.id ?? b.brandId) === id)?.name ?? id ?? '—';
  const getModelName = (id) =>
    models.find((m) => (m.id ?? m.modelId) === id)?.name ?? id ?? '—';

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'type', label: 'Type', render: (r) => r.type || 'DEVICE' },
    {
      key: 'brand',
      label: 'Brand',
      render: (r) => getBrandName(r.brandId),
    },
    {
      key: 'model',
      label: 'Model',
      render: (r) => getModelName(r.modelId),
    },
    {
      key: 'price',
      label: 'Price',
      render: (r) =>
        r.price != null ? `₹${Number(r.price).toLocaleString('en-IN')}` : '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => r.status || 'ACTIVE',
    },
    {
      key: 'imageUrl',
      label: 'Image URL',
      render: (r) => r.imageUrl || '—',
    },
  ];

  const filteredModels = brandId
    ? models.filter((m) => (m.brandId ?? m.brand?.id) === brandId)
    : models;

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Marketplace Items</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add item
        </button>
      </div>
      <p className="text-admin-muted text-sm mb-4">
        Manage products shown in the shop owner “Buy / Sell” flows. These map to marketplace
        products (GET /marketplace/products).
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-admin-muted text-sm">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={items}
          keyExtractor={(r) => r.id ?? JSON.stringify(r)}
          onEdit={openEdit}
          onDelete={handleDelete}
          emptyMessage="No marketplace items. Add one to show in the Buy/Sell screens."
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-admin-card border border-admin-border p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">
              {modal.type === 'create' ? 'New marketplace item' : 'Edit marketplace item'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-admin-muted mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                >
                  <option value="DEVICE">DEVICE</option>
                  <option value="SPARE_PART">SPARE_PART</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Brand</label>
                <select
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  required
                >
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Model</label>
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  required
                >
                  <option value="">Select model</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Price (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Image URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  placeholder="https://…/product.png"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 text-slate-600 hover:bg-admin-dark"
                >
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

