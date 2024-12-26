import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

interface Category {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number; // paise
  tags: string[];
  isAvailable: boolean;
  categoryId: string;
}

let toastIdSeq = 0;
interface Toast { id: number; message: string; type: 'error' | 'success' }

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  function show(message: string, type: Toast['type'] = 'error') {
    const id = ++toastIdSeq;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }
  return { toasts, show };
}

interface ItemModalProps {
  item?: MenuItem;
  categories: Category[];
  defaultCategoryId: string;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: 'error' | 'success') => void;
}

function ItemModal({ item, categories, defaultCategoryId, onClose, onSaved, showToast }: ItemModalProps) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [priceRupees, setPriceRupees] = useState(item ? (item.price / 100).toFixed(2) : '');
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !priceRupees) { showToast('Name and price are required.'); return; }
    const priceNum = parseFloat(priceRupees);
    if (isNaN(priceNum) || priceNum < 0) { showToast('Enter a valid price.'); return; }
    const payload = {
      name: name.trim(),
      description: description.trim(),
      price: Math.round(priceNum * 100),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      isAvailable,
      categoryId,
    };
    setSaving(true);
    try {
      if (item) {
        await api.patch(`/menu/items/${item.id}`, payload);
        showToast('Item updated.', 'success');
      } else {
        await api.post('/menu/items', payload);
        showToast('Item added.', 'success');
      }
      onSaved();
      onClose();
    } catch {
      showToast('Failed to save item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative card w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold dark:text-white mb-4">{item ? 'Edit Item' : 'Add Item'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paneer Tikka" required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Marinated and grilled cottage cheese" />
          </div>
          <div>
            <label className="label">Price (₹)</label>
            <input className="input" type="number" min="0" step="0.01" value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} placeholder="250.00" required />
          </div>
          <div>
            <label className="label">Tags (comma-separated)</label>
            <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="veg, starter, grilled" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input id="avail" type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} className="w-4 h-4 accent-green-600" />
            <label htmlFor="avail" className="text-sm text-gray-700 dark:text-gray-300">Available</label>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : (item ? 'Update Item' : 'Add Item')}</button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Menu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | undefined>(undefined);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const dragCatRef = useRef<string | null>(null);
  const { toasts, show: showToast } = useToasts();

  const fetchCategories = useCallback(async () => {
    setLoadingCats(true);
    try {
      const res = await api.get<Category[]>('/menu/categories');
      const sorted = [...res.data].sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(sorted);
      if (!selectedCat && sorted.length > 0) setSelectedCat(sorted[0].id);
    } catch {
      showToast('Failed to load categories.');
    } finally {
      setLoadingCats(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchItems = useCallback(async (catId: string) => {
    setLoadingItems(true);
    try {
      const res = await api.get<MenuItem[]>(`/menu/items?categoryId=${catId}`);
      setItems(res.data);
    } catch {
      showToast('Failed to load items.');
    } finally {
      setLoadingItems(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { if (selectedCat) fetchItems(selectedCat); }, [selectedCat, fetchItems]);

  async function addCategory() {
    if (!newCatName.trim()) return;
    try {
      await api.post('/menu/categories', { name: newCatName.trim() });
      setNewCatName('');
      await fetchCategories();
      showToast('Category added.', 'success');
    } catch {
      showToast('Failed to add category.');
    }
  }

  async function renameCategory(id: string) {
    if (!editingCatName.trim()) { setEditingCatId(null); return; }
    try {
      await api.patch(`/menu/categories/${id}`, { name: editingCatName.trim() });
      setEditingCatId(null);
      await fetchCategories();
    } catch {
      showToast('Failed to rename category.');
    }
  }

  async function toggleCategoryActive(cat: Category) {
    try {
      await api.patch(`/menu/categories/${cat.id}`, { isActive: !cat.isActive });
      await fetchCategories();
    } catch {
      showToast('Failed to toggle category.');
    }
  }

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category and all its items?')) return;
    try {
      await api.delete(`/menu/categories/${id}`);
      if (selectedCat === id) setSelectedCat(null);
      await fetchCategories();
      showToast('Category deleted.', 'success');
    } catch {
      showToast('Failed to delete category.');
    }
  }

  async function toggleItemAvailability(item: MenuItem) {
    try {
      await api.patch(`/menu/items/${item.id}/availability`, { isAvailable: !item.isAvailable });
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i));
    } catch {
      showToast('Failed to toggle availability.');
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/menu/items/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      showToast('Item deleted.', 'success');
    } catch {
      showToast('Failed to delete item.');
    }
  }

  // Category drag to reorder
  function onCatDragStart(id: string) { dragCatRef.current = id; }
  function onCatDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverCat(id); }
  async function onCatDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverCat(null);
    const fromId = dragCatRef.current;
    if (!fromId || fromId === targetId) return;
    const from = categories.findIndex((c) => c.id === fromId);
    const to = categories.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, sortOrder: i }));
    setCategories(updated);
    try {
      await api.patch('/menu/categories/reorder', { order: updated.map((c) => ({ id: c.id, sortOrder: c.sortOrder })) });
    } catch {
      showToast('Failed to save order.');
      fetchCategories();
    }
  }

  const selectedCatData = categories.find((c) => c.id === selectedCat);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Toast */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`text-white text-sm rounded-lg px-4 py-3 shadow-lg max-w-xs ${t.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Left pane: Categories */}
      <div className="w-64 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-white text-sm mb-3">Categories</h2>
          <div className="flex gap-2">
            <input
              className="input text-xs flex-1"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="New category…"
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <button onClick={addCategory} className="btn-primary text-xs px-2 py-1.5">+</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingCats ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />
            ))
          ) : categories.map((cat) => (
            <div
              key={cat.id}
              draggable
              onDragStart={() => onCatDragStart(cat.id)}
              onDragOver={(e) => onCatDragOver(e, cat.id)}
              onDrop={(e) => onCatDrop(e, cat.id)}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer transition-colors group ${
                selectedCat === cat.id
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
              } ${dragOverCat === cat.id ? 'ring-2 ring-green-400' : ''}`}
            >
              {/* Drag handle */}
              <svg className="w-4 h-4 text-gray-300 flex-shrink-0 cursor-grab" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5a1 1 0 100 2 1 1 0 000-2zM8 11a1 1 0 100 2 1 1 0 000-2zM8 17a1 1 0 100 2 1 1 0 000-2zM16 5a1 1 0 100 2 1 1 0 000-2zM16 11a1 1 0 100 2 1 1 0 000-2zM16 17a1 1 0 100 2 1 1 0 000-2z" />
              </svg>

              {editingCatId === cat.id ? (
                <input
                  autoFocus
                  className="flex-1 text-xs input py-0.5 px-1"
                  value={editingCatName}
                  onChange={(e) => setEditingCatName(e.target.value)}
                  onBlur={() => renameCategory(cat.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') renameCategory(cat.id); if (e.key === 'Escape') setEditingCatId(null); }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className={`flex-1 text-sm truncate ${!cat.isActive ? 'line-through opacity-50' : ''}`}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingCatId(cat.id); setEditingCatName(cat.name); }}
                >
                  {cat.name}
                </span>
              )}

              <div className="hidden group-hover:flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  title="Toggle active"
                  onClick={() => toggleCategoryActive(cat)}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${cat.isActive ? 'text-green-600' : 'text-gray-400'}`}
                >
                  {cat.isActive ? '●' : '○'}
                </button>
                <button
                  title="Delete"
                  onClick={() => deleteCategory(cat.id)}
                  className="w-5 h-5 flex items-center justify-center text-red-400 hover:text-red-600 text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right pane: Items */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedCatData ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{selectedCatData.name}</h1>
                <p className="text-sm text-gray-400">{items.length} item(s)</p>
              </div>
              <button
                onClick={() => { setEditingItem(undefined); setShowItemModal(true); }}
                className="btn-primary"
              >
                + Add Item
              </button>
            </div>

            {loadingItems ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card p-4 h-36 animate-pulse bg-gray-100 dark:bg-gray-700" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <p>No items yet. Add one!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="card p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{item.description}</p>
                        )}
                      </div>
                      <p className="text-green-600 dark:text-green-400 font-bold whitespace-nowrap">₹{(item.price / 100).toFixed(2)}</p>
                    </div>

                    {item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span key={tag} className="badge bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{tag}</span>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
                      <button
                        onClick={() => toggleItemAvailability(item)}
                        className={`text-xs rounded-full px-2.5 py-1 font-medium transition-colors flex-shrink-0 ${
                          item.isAvailable
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {item.isAvailable ? 'Available' : 'Unavailable'}
                      </button>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => { setEditingItem(item); setShowItemModal(true); }}
                          className="btn-secondary text-xs"
                        >
                          Edit
                        </button>
                        <button onClick={() => deleteItem(item.id)} className="btn-danger text-xs">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>Select a category to manage items.</p>
          </div>
        )}
      </div>

      {/* Item modal */}
      {showItemModal && selectedCat && (
        <ItemModal
          item={editingItem}
          categories={categories}
          defaultCategoryId={selectedCat}
          onClose={() => setShowItemModal(false)}
          onSaved={() => fetchItems(selectedCat)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
