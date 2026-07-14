'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
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

// Split a comma/newline separated string into trimmed, non-empty parts.
const splitNames = (s) => (s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

// Base color words → a representative swatch hex. Used to auto-guess the swatch
// for fancy marketing names ("Rose Red" → red, "Diamond Green" → green).
const BASE_COLORS = {
  red: '#EF4444', green: '#22C55E', blue: '#3B82F6', black: '#111827', white: '#E5E7EB',
  gray: '#9CA3AF', grey: '#9CA3AF', gold: '#D4AF37', silver: '#C0C0C0', purple: '#A855F7',
  violet: '#8B5CF6', pink: '#EC4899', orange: '#F97316', yellow: '#FACC15', brown: '#92400E',
  bronze: '#7A6B5D', graphite: '#41424C', titanium: '#BBB6AE', mint: '#7FE0B8', navy: '#1E3A8A',
  teal: '#14B8A6', beige: '#E8D9B5', cream: '#F5F0E1', midnight: '#0F172A', coral: '#FF7A5A',
  lavender: '#C5A3FF', rose: '#E11D48', cyan: '#06B6D4', maroon: '#7F1D1D', ivory: '#FFFFF0',
  charcoal: '#36454F', sky: '#38BDF8', lime: '#84CC16', emerald: '#10B981', amber: '#F59E0B',
};

// Exact swatches for known marketing color names — muted/branded shades that a
// naive base-word guess would get wrong (e.g. "Rose Red" is a dusty rose, not #F00).
// Checked before the base-word fallback. Admins can still fine-tune any swatch.
const NAMED_COLORS = {
  'rose red': '#A65D5A', 'diamond green': '#3E5A57', 'rose gold': '#B76E79',
  'phantom black': '#1A1A1A', 'phantom white': '#F2F2F0', 'racing black': '#15181C',
  'dawn white': '#EDEDE8', 'gravity black': '#20242A', 'aurora blue': '#5B7F9E',
  'sunset gold': '#D9A45B', 'ceramic black': '#101216', 'star blue': '#3A5AA8',
  'glaze blue': '#6E8FB8', 'space black': '#1F1F1F', 'midnight black': '#0B0B0F',
  'ocean blue': '#2E6C9E', 'coral orange': '#FF7A4D', 'meteor black': '#181A1D',
  'natural titanium': '#BBB6AE', 'blue titanium': '#3D506B', 'desert titanium': '#A89177',
  // Pale/muted marketing shades that a base-word guess renders too saturated.
  'champagne gold': '#E7D3A1', 'passion red': '#C7343A', 'sand beige': '#E3D3B3',
  'authentic black': '#1C1C1E', 'midnight blue': '#1B2A4A', 'titanium gray': '#8E8E93',
  'starlight': '#F0EADE', 'starry black': '#16181C', 'graphite gray': '#41424C',
};

// Normalize any stored value to a 6-digit hex an <input type="color"> accepts.
const toColorInput = (h) => {
  const s = String(h || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  return '#9CA3AF';
};

// Guess a swatch hex from a free-form color name: exact known name first, then
// scan right-to-left so the base color noun wins (e.g. "Rose Red" → red, not rose).
function guessColorHex(name) {
  const n = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!n) return '#9CA3AF';
  if (NAMED_COLORS[n]) return NAMED_COLORS[n];
  const words = n.split(' ');
  for (let i = words.length - 1; i >= 0; i--) {
    if (BASE_COLORS[words[i]]) return BASE_COLORS[words[i]];
  }
  for (const k of Object.keys(BASE_COLORS)) if (n.includes(k)) return BASE_COLORS[k];
  return '#9CA3AF';
}

// Parse a "RAM + Storage" chip like "6 GB + 128 GB" into option values.
function parseSpec(s) {
  const parts = String(s || '').split('+').map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const ramValue = parseInt(parts[0], 10);
  const storageValue = parseInt(parts[1], 10);
  if (!ramValue || !storageValue) return null;
  const ramLabel = parts[0].replace(/\s+/g, ' ');
  const storageLabel = parts[1].replace(/\s+/g, ' ');
  return { ramValue, storageValue, ramLabel, storageLabel, label: `${ramLabel} + ${storageLabel}` };
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
  const [modelNumber, setModelNumber] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState('DEVICE');
  const [submitting, setSubmitting] = useState(false);

  // Global option sets (for resolving / creating colors + ram/storage on save)
  const [allColors, setAllColors] = useState([]);
  const [ramOptions, setRamOptions] = useState([]);
  const [storageOptions, setStorageOptions] = useState([]);

  // Per-model colors (color-only variant rows) + RAM/storage variants (spec-only rows)
  const [colorInput, setColorInput] = useState('');
  const [colorChips, setColorChips] = useState([]);   // [{ name, hex, colorId?, variantId? }]
  const [specInput, setSpecInput] = useState('');
  const [specChips, setSpecChips] = useState([]);      // [{ label, ramValue, storageValue, ramLabel, storageLabel, ramId?, storageId?, variantId? }]
  // Original variant rows loaded on edit, so we can diff → add/delete on save
  const [origColorVariants, setOrigColorVariants] = useState([]); // [{ variantId }]
  const [origSpecVariants, setOrigSpecVariants] = useState([]);   // [{ variantId }]

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

  // Colors + RAM + Storage master options (used to render swatches and to
  // find-or-create the underlying master rows when saving a model's variants).
  const loadOptionSets = async () => {
    const [cols, rams, stos] = await Promise.all([
      masterApi.get('/master/colors').catch(() => []),
      masterApi.get('/master/ram-options').catch(() => []),
      masterApi.get('/master/storage-options').catch(() => []),
    ]);
    setAllColors(Array.isArray(cols) ? cols : cols?.content ?? []);
    setRamOptions(Array.isArray(rams) ? rams : rams?.content ?? []);
    setStorageOptions(Array.isArray(stos) ? stos : stos?.content ?? []);
  };
  useEffect(() => { loadOptionSets(); }, []);

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
    setModelNumber('');
    setImageUrl('');
    setCategory('DEVICE');
    setColorInput(''); setColorChips([]); setOrigColorVariants([]);
    setSpecInput(''); setSpecChips([]); setOrigSpecVariants([]);
  };

  const openEdit = async (item) => {
    setModal({ type: 'edit', item });
    // Reverse-resolve from seriesId → mapping → (category, brand)
    const s = allSeries.find((x) => x.id === item.seriesId);
    const map = s ? mappings.find((m) => m.id === s.categoryBrandId) : null;
    setFormCategoryId(map?.categoryId || item.categoryId || '');
    setFormBrandId(map?.brandId || item.brandId || '');
    setFormSeriesId(item.seriesId || '');
    setName(item.name || '');
    setModelNumber(item.modelNumber || '');
    setImageUrl(item.imageUrl || '');
    setCategory(item.category || 'DEVICE');
    // Load this model's variant rows → split into color-only + spec-only chips.
    setColorInput(''); setColorChips([]); setOrigColorVariants([]);
    setSpecInput(''); setSpecChips([]); setOrigSpecVariants([]);
    try {
      const variants = await masterApi.get(`/master/models/${item.id}/variants`).catch(() => []);
      const cChips = [], sChips = [], oColors = [], oSpecs = [];
      for (const v of (Array.isArray(variants) ? variants : [])) {
        const hasSpec = v.ramOptionId && v.storageOptionId;
        const hasColor = !!v.colorId;
        if (hasColor && !hasSpec) {
          const col = allColors.find((c) => c.id === v.colorId);
          const nm = col?.name || 'Color';
          cChips.push({ name: nm, hex: col?.hexCode || guessColorHex(nm), colorId: v.colorId, variantId: v.id });
          oColors.push({ variantId: v.id });
        } else if (hasSpec && !hasColor) {
          const ram = ramOptions.find((r) => r.id === v.ramOptionId);
          const sto = storageOptions.find((s) => s.id === v.storageOptionId);
          const ramLabel = ram?.label || (ram ? `${ram.valueGb} GB` : '?');
          const storageLabel = sto?.label || (sto ? `${sto.valueGb} GB` : '?');
          sChips.push({ label: `${ramLabel} + ${storageLabel}`, ramValue: ram?.valueGb, storageValue: sto?.valueGb, ramLabel, storageLabel, ramId: v.ramOptionId, storageId: v.storageOptionId, variantId: v.id });
          oSpecs.push({ variantId: v.id });
        }
      }
      setColorChips(cChips); setSpecChips(sChips);
      setOrigColorVariants(oColors); setOrigSpecVariants(oSpecs);
    } catch { /* leave chips empty on failure */ }
  };
  const closeModal = () => setModal(null);

  // ---- Color chips ----
  const addColorChips = () => {
    const parts = splitNames(colorInput);
    if (!parts.length) return;
    setColorChips((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (next.some((x) => x.name.toLowerCase() === p.toLowerCase())) continue;
        const existing = allColors.find((c) => c.name.toLowerCase() === p.toLowerCase());
        next.push(existing
          ? { name: existing.name, hex: existing.hexCode || guessColorHex(existing.name), colorId: existing.id }
          : { name: p, hex: guessColorHex(p) });
      }
      return next;
    });
    setColorInput('');
  };
  const removeColorChip = (idx) => setColorChips((prev) => prev.filter((_, i) => i !== idx));
  // Fine-tune a swatch to match the real product color.
  const updateColorHex = (idx, hex) => setColorChips((prev) => prev.map((c, i) => (i === idx ? { ...c, hex, hexTouched: true } : c)));

  // ---- RAM + Storage chips ----
  const addSpecChips = () => {
    const parts = splitNames(specInput);
    if (!parts.length) return;
    let bad = false;
    setSpecChips((prev) => {
      const next = [...prev];
      for (const p of parts) {
        const spec = parseSpec(p);
        if (!spec) { bad = true; continue; }
        const key = `${spec.ramValue}+${spec.storageValue}`;
        if (next.some((x) => `${x.ramValue}+${x.storageValue}` === key)) continue;
        const ram = ramOptions.find((r) => r.valueGb === spec.ramValue);
        const sto = storageOptions.find((s) => s.valueGb === spec.storageValue);
        next.push({ ...spec, ramId: ram?.id, storageId: sto?.id });
      }
      return next;
    });
    if (bad) setError('Use the format "RAM + Storage", e.g. 6 GB + 128 GB.');
    setSpecInput('');
  };
  const removeSpecChip = (idx) => setSpecChips((prev) => prev.filter((_, i) => i !== idx));

  // Persist the model's color-only + spec-only variant rows: delete removed ones,
  // create new ones (find-or-create the underlying master color/ram/storage first).
  // Full combos (color + ram + storage on one row) are left untouched.
  const syncVariants = async (modelId) => {
    // Colors — delete removed, then add new
    for (const ov of origColorVariants) {
      if (!colorChips.some((c) => c.variantId === ov.variantId)) {
        await masterApi.delete(`/master/model-variants/${ov.variantId}`).catch(() => {});
      }
    }
    for (const c of colorChips) {
      let colorId = c.colorId, created = false;
      if (!colorId) {
        const existing = allColors.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
        if (existing) colorId = existing.id;
        else { colorId = (await masterApi.post('/master/colors', { name: c.name, hexCode: c.hex }).catch(() => null))?.id; created = true; }
      }
      // If the admin fine-tuned an existing color's swatch, persist the corrected hex.
      if (colorId && !created && c.hexTouched) {
        await masterApi.put(`/master/colors/${colorId}`, { name: c.name, hexCode: c.hex }).catch(() => {});
      }
      // Attach a color-only variant row only for chips that aren't already linked.
      if (colorId && !c.variantId) await masterApi.post('/master/model-variants', { modelId, colorId }).catch(() => {});
    }
    // RAM + Storage — delete removed, then add new
    for (const ov of origSpecVariants) {
      if (!specChips.some((s) => s.variantId === ov.variantId)) {
        await masterApi.delete(`/master/model-variants/${ov.variantId}`).catch(() => {});
      }
    }
    for (const s of specChips) {
      if (s.variantId) continue;
      let ramId = s.ramId, storageId = s.storageId;
      if (!ramId) {
        ramId = ramOptions.find((r) => r.valueGb === s.ramValue)?.id
          || (await masterApi.post('/master/ram-options', { valueGb: s.ramValue, label: s.ramLabel || `${s.ramValue} GB` }).catch(() => null))?.id;
      }
      if (!storageId) {
        storageId = storageOptions.find((r) => r.valueGb === s.storageValue)?.id
          || (await masterApi.post('/master/storage-options', { valueGb: s.storageValue, label: s.storageLabel || `${s.storageValue} GB` }).catch(() => null))?.id;
      }
      if (ramId && storageId) await masterApi.post('/master/model-variants', { modelId, ramOptionId: ramId, storageOptionId: storageId }).catch(() => {});
    }
    loadOptionSets();
  };

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
        modelNumber: modelNumber.trim() || null,
        // Slug is no longer edited in the UI; keep it auto-generated so the
        // (series_id, slug) unique constraint and legacy consumers keep working.
        slug: slugify(name),
        imageUrl: imageUrl.trim() || null,
        category: category || null,
      };
      let modelId;
      if (modal.type === 'create') {
        const created = await masterApi.post('/master/models', body);
        modelId = created?.id;
      } else {
        await masterApi.put(`/master/models/${modal.item.id}`, body);
        modelId = modal.item.id;
      }
      if (modelId) await syncVariants(modelId);
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
    { key: 'modelNumber', label: 'Model number', render: (r) => r.modelNumber || '—' },
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
        <h1 className="text-2xl font-semibold text-slate-900">Models</h1>
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg bg-admin-card border border-admin-border px-3 py-2 text-slate-800 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
            className="rounded-lg bg-admin-card border border-admin-border px-3 py-2 text-slate-800 text-sm">
            <option value="">All brands</option>
            {brandsForCategory.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
          </select>
          <select value={filterSeries} onChange={(e) => setFilterSeries(e.target.value)}
            className="rounded-lg bg-admin-card border border-admin-border px-3 py-2 text-slate-800 text-sm">
            <option value="">All series</option>
            {seriesForFilter.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
          </select>
          <button type="button" onClick={loadModels} disabled={loading}
            title="Reload models"
            className="inline-flex items-center gap-1.5 rounded-lg bg-admin-card border border-admin-border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-admin-dark disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button type="button" onClick={openCreate} disabled={!brands.length}
            className="rounded-lg bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Add model
          </button>
        </div>
      </div>
      <p className="text-admin-muted text-sm mb-4">
        Models live under a series — e.g. <span className="text-slate-600">Mobile + Vivo → Y Series → Vivo Y20</span>.
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-admin-muted">Loading…</p>
      ) : (
        <DataTable columns={columns} rows={list} onEdit={openEdit} onDelete={handleDelete} emptyMessage="No models." />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-admin-card border border-admin-border p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">
              {modal.type === 'create' ? 'New model' : 'Edit model'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Category</label>
                  <select value={formCategoryId}
                    onChange={(e) => { setFormCategoryId(e.target.value); setFormBrandId(''); setFormSeriesId(''); }}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900" required>
                    <option value="">Select</option>
                    {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Brand</label>
                  <select value={formBrandId}
                    onChange={(e) => { setFormBrandId(e.target.value); setFormSeriesId(''); }}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                    required disabled={!formCategoryId}>
                    <option value="">Select</option>
                    {formBrandOptions.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-admin-muted mb-1">Series</label>
                  <select value={formSeriesId} onChange={(e) => setFormSeriesId(e.target.value)}
                    className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                    disabled={!formBrandId}>
                    <option value="">— None —</option>
                    {formSeriesOptions.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Model name</label>
                <input type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  placeholder="e.g. Vivo Y20" required />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Model number</label>
                <input type="text" value={modelNumber} onChange={(e) => setModelNumber(e.target.value)}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  placeholder="e.g. V2027" />
                <p className="mt-1 text-xs text-admin-muted">Manufacturer model number (optional).</p>
              </div>

              {/* Colors — type a name, swatch auto-detected; each becomes a color-only variant row */}
              <div>
                <label className="block text-sm text-admin-muted mb-1">Colors</label>
                <input type="text" value={colorInput} onChange={(e) => setColorInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColorChips(); } }}
                  onBlur={addColorChips}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  placeholder="Rose Red, Diamond Green — comma-separated, press Enter" />
                {colorChips.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {colorChips.map((c, i) => (
                      <span key={`${c.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-admin-dark border border-admin-border px-3 py-1 text-xs text-slate-800">
                        <label className="relative inline-flex h-4 w-4" title="Click to fine-tune this color">
                          <span className="inline-block h-4 w-4 rounded-full border border-admin-border" style={{ backgroundColor: c.hex }} />
                          <input type="color" value={toColorInput(c.hex)} onChange={(e) => updateColorHex(i, e.target.value)}
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                        </label>
                        {c.name}
                        <button type="button" onClick={() => removeColorChip(i)} className="text-slate-400 hover:text-slate-700">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-admin-muted">Type a color name; the swatch is auto-detected — <span className="text-slate-600">click a swatch to fine-tune it</span>.</p>
              </div>

              {/* RAM + Storage variants — "6 GB + 128 GB" chips → spec-only variant rows */}
              <div>
                <label className="block text-sm text-admin-muted mb-1">RAM + Storage variants</label>
                <input type="text" value={specInput} onChange={(e) => setSpecInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSpecChips(); } }}
                  onBlur={addSpecChips}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  placeholder="4 GB + 128 GB, 6 GB + 128 GB — comma-separated, press Enter" />
                {specChips.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {specChips.map((s, i) => (
                      <span key={`${s.ramValue}-${s.storageValue}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-admin-accent/20 text-admin-accent px-3 py-1 text-xs">
                        {s.label}
                        <button type="button" onClick={() => removeSpecChip(i)} className="text-admin-accent/80 hover:text-slate-700">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-xs text-admin-muted">Format: RAM + Storage (e.g. 6 GB + 128 GB).</p>
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
                <button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 text-slate-600 hover:bg-admin-dark">Cancel</button>
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
