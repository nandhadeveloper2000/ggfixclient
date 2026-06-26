'use client';

import { useEffect, useMemo, useState } from 'react';
import { masterApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import ImageUpload from '@/components/ImageUpload';

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function MasterModelsPage() {
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [allSeries, setAllSeries] = useState([]);

  // Table filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSeries, setFilterSeries] = useState('');

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [modal, setModal] = useState(null);
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formBrandId, setFormBrandId] = useState('');
  const [formSeriesId, setFormSeriesId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('DEVICE');
  const [submitting, setSubmitting] = useState(false);

  const resolveMappingId = (categoryId, brandId) =>
    mappings.find((m) => m.categoryId === categoryId && m.brandId === brandId)?.id || null;

  // ---- Reference data
  const loadRefData = async () => {
    try {
      const [cats, brs, maps] = await Promise.all([
        masterApi.get('/master/device-categories').catch(() => []),
        masterApi.get('/master/brands').catch(() => []),
        masterApi.get('/master/category-brand-mappings').catch(() => []),
      ]);
      const catArr = Array.isArray(cats) ? cats : cats?.content ?? [];
      const brandArr = Array.isArray(brs) ? brs : brs?.content ?? [];
      const mapArr = Array.isArray(maps) ? maps : maps?.content ?? [];
      setCategories(catArr);
      setBrands(brandArr);
      setMappings(mapArr);

      // Pre-fetch all series across mappings so the form can resolve series → mapping → (cat, brand)
      const allSeriesAcc = [];
      for (const m of mapArr) {
        const rows = await masterApi.get(`/master/category-brand-mappings/${m.id}/series`).catch(() => []);
        if (Array.isArray(rows)) allSeriesAcc.push(...rows);
      }
      setAllSeries(allSeriesAcc);
    } catch (e) {
      setError(e.message || 'Failed to load reference data');
    }
  };
  useEffect(() => { loadRefData(); }, []);

  // Cascading filter helpers
  const brandsForCategory = useMemo(() => {
    if (!filterCategory) return brands;
    const allowed = new Set(mappings.filter((m) => m.categoryId === filterCategory).map((m) => m.brandId));
    return brands.filter((b) => allowed.has(b.id));
  }, [filterCategory, brands, mappings]);

  const seriesForFilter = useMemo(() => {
    if (filterCategory && filterBrand) {
      const id = resolveMappingId(filterCategory, filterBrand);
      return id ? allSeries.filter((s) => s.categoryBrandId === id) : [];
    }
    if (filterCategory) {
      const ids = new Set(mappings.filter((m) => m.categoryId === filterCategory).map((m) => m.id));
      return allSeries.filter((s) => ids.has(s.categoryBrandId));
    }
    if (filterBrand) {
      const ids = new Set(mappings.filter((m) => m.brandId === filterBrand).map((m) => m.id));
      return allSeries.filter((s) => ids.has(s.categoryBrandId));
    }
    return allSeries;
  }, [allSeries, mappings, filterCategory, filterBrand]);

  useEffect(() => {
    if (filterBrand && !brandsForCategory.some((b) => b.id === filterBrand)) setFilterBrand('');
  }, [filterBrand, brandsForCategory]);
  useEffect(() => {
    if (filterSeries && !seriesForFilter.some((s) => s.id === filterSeries)) setFilterSeries('');
  }, [filterSeries, seriesForFilter]);

  // ---- Models list
  const loadModels = async () => {
    setLoading(true);
    setError('');
    try {
      let acc = [];
      if (filterSeries) {
        const rows = await masterApi.get(`/master/series/${filterSeries}/models`).catch(() => []);
        acc = Array.isArray(rows) ? rows : [];
      } else if (filterBrand) {
        const rows = await masterApi.get(`/master/brands/${filterBrand}/models`).catch(() => []);
        acc = Array.isArray(rows) ? rows : [];
      } else {
        // No brand/series filter: aggregate across all brands
        for (const b of brands) {
          const rows = await masterApi.get(`/master/brands/${b.id}/models`).catch(() => []);
          if (Array.isArray(rows)) acc.push(...rows);
        }
      }

      // If a category filter is set without a brand, narrow client-side via mapping
      if (filterCategory && !filterBrand && !filterSeries) {
        const allowedBrandIds = new Set(mappings.filter((m) => m.categoryId === filterCategory).map((m) => m.brandId));
        acc = acc.filter((m) => allowedBrandIds.has(m.brandId));
      }

      setList(acc);
    } catch (e) {
      setError(e.message || 'Failed to load');
      setList([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (brands.length) loadModels(); }, [brands, filterCategory, filterBrand, filterSeries]);

  // ---- Form
  const formBrandOptions = useMemo(() => {
    if (!formCategoryId) return brands;
    const allowed = new Set(mappings.filter((m) => m.categoryId === formCategoryId).map((m) => m.brandId));
    return brands.filter((b) => allowed.has(b.id));
  }, [formCategoryId, brands, mappings]);

  const formSeriesOptions = useMemo(() => {
    if (!formCategoryId || !formBrandId) return [];
    const mid = resolveMappingId(formCategoryId, formBrandId);
    return mid ? allSeries.filter((s) => s.categoryBrandId === mid) : [];
  }, [allSeries, formCategoryId, formBrandId, mappings]);

  const openCreate = () => {
    setModal({ type: 'create' });
    setFormCategoryId(filterCategory || categories[0]?.id || '');
    setFormBrandId(filterBrand || '');
    setFormSeriesId(filterSeries || '');
    setName('');
    setSlug('');
    setImageUrl('');
    setCategory('DEVICE');
  };

  const openEdit = (item) => {
    setModal({ type: 'edit', item });
    // Reverse-resolve from seriesId → mapping → (category, brand)
    const s = allSeries.find((x) => x.id === item.seriesId);
    const map = s ? mappings.find((m) => m.id === s.categoryBrandId) : null;
    setFormCategoryId(map?.categoryId || item.categoryId || '');
    setFormBrandId(map?.brandId || item.brandId || '');
    setFormSeriesId(item.seriesId || '');
    setName(item.name || '');
    setSlug(item.slug || '');
    setImageUrl(item.imageUrl || '');
    setCategory(item.category || 'DEVICE');
  };
  const closeModal = () => setModal(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !formBrandId) return;
    setSubmitting(true);
    setError('');
    try {
      const body = {
        brandId: formBrandId,
        categoryId: formCategoryId || null,
        seriesId: formSeriesId || null,
        name: name.trim(),
        slug: slug.trim() || slugify(name),
        imageUrl: imageUrl.trim() || null,
        category: category || null,
      };
      if (modal.type === 'create') {
        await masterApi.post('/master/models', body);
      } else {
        await masterApi.put(`/master/models/${modal.item.id}`, body);
      }
      closeModal();
      loadModels();
    } catch (e) {
      setError(e.body?.message || e.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row) => {
    if (!confirm('Delete this model?')) return;
    try {
      await masterApi.delete(`/master/models/${row.id}`);
      loadModels();
    } catch (e) {
      setError(e.body?.message || e.message || 'Delete failed');
    }
  };

  const nameById = {
    cat: (id) => categories.find((c) => c.id === id)?.name,
    brand: (id) => brands.find((b) => b.id === id)?.name,
    series: (id) => allSeries.find((s) => s.id === id)?.name,
  };

  const columns = [
    {
      key: 'category',
      label: 'Category',
      render: (r) => {
        // Try via series → mapping; fall back to categoryId field
        const s = allSeries.find((x) => x.id === r.seriesId);
        const map = s ? mappings.find((m) => m.id === s.categoryBrandId) : null;
        const cid = map?.categoryId || r.categoryId;
        return nameById.cat(cid) || '—';
      },
    },
    { key: 'brand', label: 'Brand', render: (r) => nameById.brand(r.brandId) || '—' },
    { key: 'series', label: 'Series', render: (r) => nameById.series(r.seriesId) || '—' },
    { key: 'name', label: 'Model' },
    { key: 'slug', label: 'Slug', render: (r) => r.slug || '—' },
    {
      key: 'imageUrl',
      label: 'Image',
      render: (r) => (r.imageUrl
        ? <img src={r.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
        : '—'),
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Models</h1>
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg bg-admin-card border border-admin-border px-3 py-2 text-slate-200 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
            className="rounded-lg bg-admin-card border border-admin-border px-3 py-2 text-slate-200 text-sm">
            <option value="">All brands</option>
            {brandsForCategory.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
          <select value={filterSeries} onChange={(e) => setFilterSeries(e.target.value)}
            className="rounded-lg bg-admin-card border border-admin-border px-3 py-2 text-slate-200 text-sm">
            <option value="">All series</option>
            {seriesForFilter.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          <button type="button" onClick={openCreate} disabled={!brands.length}
            className="rounded-lg bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">
            Add model
          </button>
        </div>
      </div>
      <p className="text-admin-muted text-sm mb-4">
        Models live under a series — e.g. <span className="text-slate-300">Mobile + Vivo → Y Series → Vivo Y20</span>.
      </p>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-admin-muted">Loading…</p>
      ) : (
        <DataTable columns={columns} rows={list} onEdit={openEdit} onDelete={handleDelete} emptyMessage="No models." />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-admin-card border border-admin-border p-6">
            <h2 className="text-lg font-medium text-slate-100 mb-4">
              {modal.type === 'create' ? 'New model' : 'Edit model'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Category</label>
                  <select value={formCategoryId}
                    onChange={(e) => { setFormCategoryId(e.target.value); setFormBrandId(''); setFormSeriesId(''); }}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100" required>
                    <option value="">Select</option>
                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Brand</label>
                  <select value={formBrandId}
                    onChange={(e) => { setFormBrandId(e.target.value); setFormSeriesId(''); }}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                    required disabled={!formCategoryId}>
                    <option value="">Select</option>
                    {formBrandOptions.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Series</label>
                  <select value={formSeriesId} onChange={(e) => setFormSeriesId(e.target.value)}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                    disabled={!formBrandId}>
                    <option value="">— None —</option>
                    {formSeriesOptions.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Model name</label>
                <input type="text" value={name}
                  onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                  placeholder="e.g. Vivo Y20" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Slug</label>
                  <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100"
                    placeholder="vivo-y20" />
                  <p className="mt-1 text-xs text-admin-muted">Auto-generated from name. Unique within series.</p>
                </div>
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Type</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-100">
                    <option value="DEVICE">DEVICE</option>
                    <option value="SPARE_PART">SPARE_PART</option>
                  </select>
                </div>
              </div>
              <ImageUpload
                value={imageUrl}
                onChange={setImageUrl}
                label="Model image"
                caption="Hero image for this model (e.g. Vivo Y20)"
                folder="models"
                buttonText="Upload Model Image"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 text-slate-300 hover:bg-admin-dark">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="rounded-lg bg-admin-accent px-4 py-2 text-white disabled:opacity-50">
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
