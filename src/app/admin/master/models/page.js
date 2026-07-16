'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { colornames } from 'color-name-list';
import cssColorNames from 'color-name';
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

const DEFAULT_SWATCH = '#9CA3AF';
const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, '0')).join('');

// The 148 CSS keyword colors (gold, gray, black, green, teal, …) → hex. Covers
// base color nouns so "Passion Red" still resolves via its "red" word.
const CSS_HEX = new Map(Object.entries(cssColorNames).map(([k, [r, g, b]]) => [k, rgbToHex(r, g, b)]));

// ~32k community-named colors (marketing shades like "Champagne Gold" → #e8d6b3,
// "Rose Red", "Starlight"). Built once, lazily, on first color lookup.
let NAMED_HEX = null;
const namedHex = () => {
  if (!NAMED_HEX) NAMED_HEX = new Map(colornames.map((c) => [c.name.toLowerCase(), c.hex]));
  return NAMED_HEX;
};

// Normalize any stored value to a 6-digit hex an <input type="color"> accepts.
const toColorInput = (h) => {
  const s = String(h || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  return DEFAULT_SWATCH;
};

// An explicit "#abc" / "#aabbcc" / "rgb(r,g,b)" the admin typed directly.
function parseLiteralColor(n) {
  if (/^#[0-9a-f]{6}$/.test(n)) return n;
  if (/^#[0-9a-f]{3}$/.test(n)) return '#' + n.slice(1).split('').map((c) => c + c).join('');
  const m = n.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/);
  if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  return null;
}

// Resolve a free-form color name to a swatch hex, fully automatically — no
// hand-maintained table. Priority:
//   1. an explicit hex / rgb() value
//   2. the exact name in the ~32k community color list ("Champagne Gold" → #e8d6b3)
//   3. the exact CSS keyword ("gold", "teal")
//   4. word fallback, base-noun-first ("Passion Red" → red), so an unknown
//      descriptor still lands on the right base color.
function guessColorHex(name) {
  const n = String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!n) return DEFAULT_SWATCH;
  const literal = parseLiteralColor(n);
  if (literal) return literal;
  const named = namedHex();
  if (named.has(n)) return named.get(n);
  if (CSS_HEX.has(n)) return CSS_HEX.get(n);
  const words = n.split(' ');
  for (let i = words.length - 1; i >= 0; i--) {
    if (CSS_HEX.has(words[i])) return CSS_HEX.get(words[i]);
    if (named.has(words[i])) return named.get(words[i]);
  }
  return DEFAULT_SWATCH;
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

// Small on/off toggle switch. Used for a model's "Sell Active" flag in the table
// and the edit form (green = shown in the Sell flow, grey = hidden).
function ToggleSwitch({ on, onClick, title, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
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
  const [sellActive, setSellActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Global option sets (for resolving / creating colors + ram/storage on save)
  const [allColors, setAllColors] = useState([]);
  const [ramOptions, setRamOptions] = useState([]);
  const [storageOptions, setStorageOptions] = useState([]);
  const [allVariants, setAllVariants] = useState([]);  // every model_variant row — to show colors/storage in the list

  // Per-model colors (color-only variant rows) + RAM/storage variants (spec-only rows)
  const [colorInput, setColorInput] = useState('');
  const [colorChips, setColorChips] = useState([]);   // [{ name, hex, colorId?, variantId? }]
  const [pendingHex, setPendingHex] = useState(null);  // swatch picked next to the input, before the chip is added
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
    const [cols, rams, stos, vars] = await Promise.all([
      masterApi.get('/master/colors').catch(() => []),
      masterApi.get('/master/ram-options').catch(() => []),
      masterApi.get('/master/storage-options').catch(() => []),
      masterApi.get('/master/model-variants').catch(() => []),
    ]);
    setAllColors(Array.isArray(cols) ? cols : cols?.content ?? []);
    setRamOptions(Array.isArray(rams) ? rams : rams?.content ?? []);
    setStorageOptions(Array.isArray(stos) ? stos : stos?.content ?? []);
    setAllVariants(Array.isArray(vars) ? vars : vars?.content ?? []);
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
    setSellActive(true);
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
    setSellActive(item.sellActive !== false);
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
    // A color picked in the input's preview swatch overrides the auto-guess — but only
    // for a single typed name (a comma-list has no single swatch to apply it to).
    const override = parts.length === 1 ? pendingHex : null;
    setColorChips((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (next.some((x) => x.name.toLowerCase() === p.toLowerCase())) continue;
        const existing = allColors.find((c) => c.name.toLowerCase() === p.toLowerCase());
        if (existing) {
          next.push(override
            ? { name: existing.name, hex: override, colorId: existing.id, hexTouched: true }
            : { name: existing.name, hex: existing.hexCode || guessColorHex(existing.name), colorId: existing.id });
        } else {
          next.push({ name: p, hex: override || guessColorHex(p) });
        }
      }
      return next;
    });
    setColorInput('');
    setPendingHex(null);
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
        sellActive,
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

  // Flip a model's Sell-flow visibility from the table switch. Optimistic —
  // update the row immediately, revert if the PATCH fails.
  const toggleSellActive = async (row) => {
    const next = row.sellActive === false; // currently off → turn on, else turn off
    setList((prev) => prev.map((m) => (m.id === row.id ? { ...m, sellActive: next } : m)));
    try {
      await masterApi.patch(`/master/models/${row.id}/sell-active`, { sellActive: next });
    } catch (e) {
      setList((prev) => prev.map((m) => (m.id === row.id ? { ...m, sellActive: !next } : m)));
      setError(e.body?.message || e.message || 'Failed to update Sell Active');
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

  // modelId → its distinct colors ({name, hex}) and RAM+Storage labels, built once
  // from the bulk model-variants list so the table needs no per-row fetches.
  const variantsByModel = useMemo(() => {
    const colorById = new Map(allColors.map((c) => [c.id, c]));
    const ramById = new Map(ramOptions.map((r) => [r.id, r]));
    const stoById = new Map(storageOptions.map((s) => [s.id, s]));
    const gbLabel = (opt) => opt?.label || (opt?.valueGb != null ? `${opt.valueGb} GB` : '?');
    const map = new Map();
    for (const v of allVariants) {
      if (!v.modelId) continue;
      let e = map.get(v.modelId);
      if (!e) { e = { colors: [], colorKeys: new Set(), specs: [], specKeys: new Set() }; map.set(v.modelId, e); }
      if (v.colorId && !e.colorKeys.has(v.colorId)) {
        const col = colorById.get(v.colorId);
        if (col?.name) { e.colorKeys.add(v.colorId); e.colors.push({ name: col.name, hex: col.hexCode || guessColorHex(col.name) }); }
      }
      if (v.ramOptionId && v.storageOptionId) {
        const label = `${gbLabel(ramById.get(v.ramOptionId))} + ${gbLabel(stoById.get(v.storageOptionId))}`;
        if (!e.specKeys.has(label)) { e.specKeys.add(label); e.specs.push(label); }
      }
    }
    return map;
  }, [allVariants, allColors, ramOptions, storageOptions]);

  // Resolve a model's category name via series → mapping, falling back to categoryId.
  const categoryNameOf = (r) => {
    const s = allSeries.find((x) => x.id === r.seriesId);
    const map = s ? mappings.find((m) => m.id === s.categoryBrandId) : null;
    return nameById.cat(map?.categoryId || r.categoryId);
  };

  const columns = [
    {
      key: 'category',
      label: 'Category',
      search: (r) => categoryNameOf(r),
      render: (r) => categoryNameOf(r) || '—',
    },
    { key: 'brand', label: 'Brand', search: (r) => nameById.brand(r.brandId), render: (r) => nameById.brand(r.brandId) || '—' },
    { key: 'series', label: 'Series', search: (r) => nameById.series(r.seriesId), render: (r) => nameById.series(r.seriesId) || '—' },
    { key: 'name', label: 'Model' },
    { key: 'modelNumber', label: 'Model number', render: (r) => r.modelNumber || '—' },
    {
      key: 'colors',
      label: 'Colors',
      search: (r) => (variantsByModel.get(r.id)?.colors || []).map((c) => c.name).join(' '),
      render: (r) => {
        const cs = variantsByModel.get(r.id)?.colors || [];
        if (!cs.length) return '—';
        return (
          <div className="flex flex-wrap items-center gap-1.5 max-w-[220px]">
            {cs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs text-slate-700" title={c.name}>
                <span className="inline-block h-3 w-3 rounded-full border border-admin-border shrink-0" style={{ backgroundColor: c.hex }} />
                {c.name}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'specs',
      label: 'RAM + Storage',
      search: (r) => (variantsByModel.get(r.id)?.specs || []).join(' '),
      render: (r) => {
        const ss = variantsByModel.get(r.id)?.specs || [];
        if (!ss.length) return '—';
        return (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {ss.map((s, i) => (
              <span key={i} className="inline-block rounded bg-admin-dark border border-admin-border px-1.5 py-0.5 text-[11px] text-slate-700 whitespace-nowrap">{s}</span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'imageUrl',
      label: 'Image',
      render: (r) => (r.imageUrl
        ? <img src={r.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
        : '—'),
    },
    {
      key: 'sellActive',
      label: 'Sell Active',
      render: (r) => {
        const on = r.sellActive !== false;
        return (
          <ToggleSwitch
            on={on}
            title={on ? 'Shown in the Sell flow — click to hide' : 'Hidden from the Sell flow — click to show'}
            onClick={() => toggleSellActive(r)}
          />
        );
      },
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
          <form onSubmit={handleSubmit} className="w-full max-w-2xl flex flex-col max-h-[90vh] rounded-xl bg-admin-card border border-admin-border shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-admin-border shrink-0">
              <h2 className="text-lg font-medium text-slate-900">
                {modal.type === 'create' ? 'New model' : 'Edit model'}
              </h2>
              <button type="button" onClick={closeModal} aria-label="Close" className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
              <div className="grid grid-cols-2 gap-3">
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
              </div>

              {/* Sell Active — controls whether this model appears in the mobile Sell flow */}
              <div className="flex items-center justify-between rounded-lg bg-admin-dark border border-admin-border px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">Sell Active</p>
                  <p className="text-xs text-admin-muted">When on, this model is shown in the customer Sell / trade-in flow.</p>
                </div>
                <ToggleSwitch
                  on={sellActive}
                  title={sellActive ? 'Shown in the Sell flow' : 'Hidden from the Sell flow'}
                  onClick={() => setSellActive((v) => !v)}
                />
              </div>

              {/* Colors — type a name, swatch auto-detected; each becomes a color-only variant row */}
              <div>
                <label className="block text-sm text-admin-muted mb-1">Colors</label>
                <div className="flex items-center gap-2">
                  <input type="text" value={colorInput}
                    onChange={(e) => { setColorInput(e.target.value); setPendingHex(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColorChips(); } }}
                    onBlur={(e) => { if (e.relatedTarget?.dataset?.swatch) return; addColorChips(); }}
                    className="flex-1 rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                    placeholder="Type ONE color, e.g. Passion Red — then press Enter" />
                  {colorInput.trim() && !colorInput.includes(',') && (
                    <label className="relative inline-flex h-10 w-10 shrink-0" title="Click to pick the exact color, then press Enter">
                      <span className="inline-block h-10 w-10 rounded-lg border border-admin-border" style={{ backgroundColor: pendingHex || guessColorHex(colorInput) }} />
                      <input type="color" data-swatch="1" value={toColorInput(pendingHex || guessColorHex(colorInput))}
                        onChange={(e) => setPendingHex(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColorChips(); } }}
                        onBlur={() => addColorChips()}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    </label>
                  )}
                </div>
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
                <p className="mt-1 text-xs text-admin-muted">Add <span className="text-slate-600">one color at a time</span>: type the name → the swatch beside it shows the detected color → <span className="text-slate-600">click that swatch to pick/eyedrop the exact color</span> → press Enter. Repeat for the next color.</p>
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
            </div>
            <div className="flex gap-2 justify-end px-6 py-4 border-t border-admin-border shrink-0">
              <button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 text-slate-600 hover:bg-admin-dark">Cancel</button>
              <button type="submit" disabled={submitting}
                className="rounded-lg bg-admin-accent px-4 py-2 text-white disabled:opacity-50">
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
