import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface Customer {
  id: string;
  phone: string;
  name: string;
  totalOrders: number;
  lastOrderAt: string | null;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface CustomerOrder {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  createdAt: string;
  items: OrderItem[];
}

interface CustomerDetail {
  id: string;
  phone: string;
  name: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string | null;
  orders: CustomerOrder[];
}

type SortDir = 'asc' | 'desc';

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge bg-yellow-100 text-yellow-800',
  confirmed: 'badge bg-blue-100 text-blue-800',
  preparing: 'badge bg-orange-100 text-orange-800',
  ready: 'badge bg-purple-100 text-purple-800',
  completed: 'badge bg-green-100 text-green-800',
  cancelled: 'badge bg-red-100 text-red-800',
};

function paiseToRupees(p: number) {
  return '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d: string | null) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

let toastIdSeq = 0;

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  function showError(message: string) {
    const id = ++toastIdSeq;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Customer[]>('/customers');
      setCustomers(res.data);
    } catch {
      showError('Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get<CustomerDetail>(`/customers/${id}`);
      setDetail(res.data);
    } catch {
      showError('Failed to load customer details.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setDetail(null);
  }, [selectedId, fetchDetail]);

  const sorted = [...customers]
    .filter((c) => {
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.phone.includes(q);
    })
    .sort((a, b) =>
      sortDir === 'desc' ? b.totalOrders - a.totalOrders : a.totalOrders - b.totalOrders
    );

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="bg-red-600 text-white text-sm rounded-lg px-4 py-3 shadow-lg max-w-xs">
            {t.message}
          </div>
        ))}
      </div>

      {/* Main table */}
      <div className={`flex-1 overflow-y-auto p-6 transition-all ${selectedId ? 'max-w-[calc(100%-384px)]' : 'w-full'}`}>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Customers</h1>
          <input
            type="text"
            placeholder="Search name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-56"
          />
        </div>

        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 animate-pulse rounded" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <p className="p-8 text-center text-gray-400">No customers found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-green-600 select-none"
                      onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                    >
                      Total Orders {sortDir === 'desc' ? '↓' : '↑'}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {sorted.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedId(customer.id === selectedId ? null : customer.id)}
                      className={`cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        selectedId === customer.id ? 'bg-green-50 dark:bg-green-900/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-200">{customer.phone}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{customer.name || 'N/A'}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold text-xs">
                          {customer.totalOrders}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(customer.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {selectedId && (
        <div className="w-96 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto flex flex-col">
          {/* Panel header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-bold dark:text-white">Customer Detail</h2>
            <button
              onClick={() => setSelectedId(null)}
              className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {detailLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 dark:bg-gray-700 animate-pulse rounded" />
              ))}
            </div>
          ) : detail ? (
            <>
              {/* Profile */}
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-bold text-lg">
                    {(detail.name || detail.phone).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold dark:text-white">{detail.name || 'No name'}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{detail.phone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{detail.totalOrders}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Orders</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">{paiseToRupees(detail.totalSpent)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Spent</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">Last order: {formatDate(detail.lastOrderAt)}</p>
              </div>

              {/* Order history */}
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Order History</h3>
                {detail.orders.length === 0 ? (
                  <p className="text-sm text-gray-400">No orders yet.</p>
                ) : (
                  <div className="space-y-3">
                    {detail.orders.map((order) => (
                      <div key={order.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-200">
                            #{order.orderNumber}
                          </span>
                          <span className={STATUS_BADGE[order.status] ?? 'badge bg-gray-100 text-gray-600'}>{order.status}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                        </p>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">{paiseToRupees(order.total)}</span>
                          <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
