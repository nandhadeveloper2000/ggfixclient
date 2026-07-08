'use client';

import { useEffect, useState } from 'react';
import { masterApi } from '@/lib/api';
import DataTable from '@/components/DataTable';

// Common phone / device colors → hex. Lookup is case-insensitive and
// whitespace-insensitive so "Natural Titanium" and "natural  titanium"
// both resolve to the same swatch.
const COLOR_NAME_TO_HEX = {
  // Basics
  'black': '#000000',
  'white': '#FFFFFF',
  'silver': '#C0C0C0',
  'gold': '#D4AF37',
  'rose gold': '#B76E79',
  'graphite': '#41424C',
  'midnight': '#171E27',
  'starlight': '#F0EAD6',
  'space gray': '#535150',
  'space grey': '#535150',
  'space black': '#1F1F1F',
  'jet black': '#0A0A0A',

  // Apple iPhone titanium line
  'natural titanium': '#BBB6AE',
  'blue titanium': '#3D506B',
  'white titanium': '#E3E3DE',
  'black titanium': '#3A3A3C',
  'desert titanium': '#A89177',

  // Common iPhone / Samsung accent colors
  'blue': '#0A84FF',
  'red': '#FF3B30',
  'green': '#34C759',
  'purple': '#AF52DE',
  'yellow': '#FFD60A',
  'pink': '#FF6482',
  'coral': '#FF7A5A',
  'lavender': '#C5A3FF',
  'orange': '#FF9500',
  'mint': '#B9F0D3',
  'sierra blue': '#9BB5CE',
  'alpine green': '#576856',
  'deep purple': '#594764',
  'pacific blue': '#2D5566',
  'product red': '#BF0013',

  // Samsung Galaxy
  'phantom black': '#1A1A1A',
  'phantom white': '#F2F2F0',
  'phantom silver': '#B9BBBE',
  'phantom green': '#637D6F',
  'phantom violet': '#A6A0CC',
  'mystic bronze': '#7A6B5D',
  'cloud lavender': '#C8B8E1',
  'cloud pink': '#F5C8D2',
  'cloud mint': '#BFE3D0',
  'cloud navy': '#2C3E5A',
  'awesome blue': '#5A7FBF',
  'awesome violet': '#9882B8',
  'awesome mint': '#B4E0C9',
  'cosmic black': '#1B1B1B',
  'cosmic silver': '#BFC3C7',

  // Google Pixel
  'obsidian': '#2A2A2A',
  'snow': '#F5F5F5',
  'hazel': '#8C9082',
  'lemongrass': '#DBE5A4',
  'bay': '#A6C0DD',
  'porcelain': '#EDE6DA',
  'charcoal': '#36454F',
  'sorta sunny': '#F0DCA9',
  'sorta seafoam': '#A8D5BA',

  // Misc / web
  'gray': '#808080',
  'grey': '#808080',
  'brown': '#964B00',
  'beige': '#F5F5DC',
};

const normalizeName = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export default function MasterColorsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [name, setName] = useState('');
  const [hexCode, setHexCode] = useState('#000000');
  // Track whether the user has manually edited the hex so we don't
  // overwrite their choice when they keep typing in the name field.
  const [hexTouched, setHexTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await masterApi.get('/master/colors');
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
    setHexCode('#000000');
    setHexTouched(false);
  };
  const openEdit = (item) => {
    setModal({ type: 'edit', item });
    setName(item.name || '');
    setHexCode(item.hexCode || '#000000');
    setHexTouched(true);
  };
  const closeModal = () => setModal(null);

  const handleNameChange = (e) => {
    const value = e.target.value;
    setName(value);
    if (hexTouched) return;
    const hit = COLOR_NAME_TO_HEX[normalizeName(value)];
    if (hit) setHexCode(hit);
  };

  const handleHexChange = (value) => {
    setHexCode(value);
    setHexTouched(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        hexCode: hexCode.trim() || null,
      };
      if (modal.type === 'create') {
        await masterApi.post('/master/colors', body);
      } else {
        await masterApi.put(`/master/colors/${modal.item.id}`, body);
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
    if (!confirm('Delete this color?')) return;
    try {
      await masterApi.delete(`/master/colors/${row.id}`);
      load();
    } catch (e) {
      setError(e.body?.message || e.message || 'Delete failed');
    }
  };

  const columns = [
    {
      key: 'swatch',
      label: '',
      render: (r) => (
        <span
          className="inline-block h-5 w-5 rounded border border-admin-border"
          style={{ backgroundColor: r.hexCode || 'transparent' }}
        />
      ),
    },
    { key: 'name', label: 'Name' },
    { key: 'hexCode', label: 'Hex', render: (r) => r.hexCode || '—' },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Colors</h1>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-admin-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Add color
        </button>
      </div>
      <p className="text-admin-muted text-sm mb-4">
        Device color options (GET /api/master/colors).
      </p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-admin-muted">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={list}
          onEdit={openEdit}
          onDelete={handleDelete}
          emptyMessage="No colors."
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-admin-card border border-admin-border p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">
              {modal.type === 'create' ? 'New color' : 'Edit color'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-admin-muted mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={handleNameChange}
                  className="w-full rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                  placeholder="e.g. Natural Titanium"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-admin-muted mb-1">Hex code</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={hexCode}
                    onChange={(e) => handleHexChange(e.target.value)}
                    className="h-10 w-12 rounded border border-admin-border bg-admin-dark"
                  />
                  <input
                    type="text"
                    value={hexCode}
                    onChange={(e) => handleHexChange(e.target.value)}
                    className="flex-1 rounded-lg bg-admin-dark border border-admin-border px-3 py-2 text-slate-900"
                    placeholder="#RRGGBB"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeModal} className="rounded-lg px-4 py-2 text-slate-600 hover:bg-admin-dark">Cancel</button>
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
