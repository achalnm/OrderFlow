import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';

type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled';

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number; // paise
}

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number; // paise
  tax: number;      // paise
  total: number;    // paise
  status: OrderStatus;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  receiptText?: string;
}

interface OrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_LIST: OrderStatus[] = [
  'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled',
];

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'badge bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  confirmed: 'badge bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  preparing: 'badge bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  ready: 'badge bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  completed: 'badge bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  cancelled: 'badge bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
};

function paiseToRupees(p: number) {
  return '₹' + (p / 100).toFixed(2);
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 0) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

let toastIdSeq = 0;
interface Toast { id: number; message: string; type: 'error' | 'success' }

function KanbanCard({
  order,
  onDragStart,
  onClick,
  flash,
}: {
  order: Order;
  onDragStart: (id: string) => void;
  onClick: (order: Order) => void;
  flash: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(order.id)}
      onClick={() => onClick(order)}
      className={`card p-3 cursor-pointer hover:shadow-md transition-shadow mb-2 select-none ${
        flash ? 'ring-2 ring-green-400 animate-pulse' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">#{order.orderNumber}</span>
        <span className="text-xs text-gray-400">{timeAgo(order.createdAt)}</span>
      </div>
      <p className="text-sm font-medium truncate text-gray-800 dark:text-gray-100">{order.customerName}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{order.items.length} item(s)</p>
      <p className="text-sm font-semibold text-green-600 dark:text-green-400 mt-1">{paiseToRupees(order.total)}</p>
    </div>
  );
}

function OrderDrawer({
  order,
  onClose,
  onStatusChange,
}: {
  order: Order;
  onClose: () => void;
  onStatusChange: (id: string, status: OrderStatus, reason?: string) => Promise<void>;
}) {
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [receiptText, setReceiptText] = useState(order.receiptText ?? '');
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { orderId: string; text: string }) => {
      if (data.orderId === order.id) setReceiptText(data.text);
    };
    socket.on('receipt:printed', handler);
    return () => { socket.off('receipt:printed', handler); };
  }, [socket, order.id]);

  const nextStates = STATUS_TRANSITIONS[order.status].filter((s) => s !== 'cancelled');

  async function advance(status: OrderStatus) {
    setAdvancing(true);
    try { await onStatusChange(order.id, status); } finally { setAdvancing(false); }
  }

  async function confirmCancel() {
    if (!cancelReason.trim()) return;
    setAdvancing(true);
    try { await onStatusChange(order.id, 'cancelled', cancelReason); setShowCancel(false); }
    finally { setAdvancing(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-gray-800 h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold dark:text-white">Order #{order.orderNumber}</h2>
            <span className={STATUS_BADGE[order.status]}>{order.status}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Customer */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer</p>
          <p className="font-semibold dark:text-white">{order.customerName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{order.customerPhone}</p>
        </div>

        {/* Items */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Items</p>
          <div className="space-y-1">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-200">
                  {item.quantity}× {item.name}
                </span>
                <span className="text-gray-600 dark:text-gray-300">{paiseToRupees(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>Subtotal</span><span>{paiseToRupees(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500 dark:text-gray-400">
              <span>Tax</span><span>{paiseToRupees(order.tax)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 dark:text-white">
              <span>Total</span><span>{paiseToRupees(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Payment</p>
          <p className="text-sm dark:text-white capitalize">{order.paymentMethod} / <span className={order.paymentStatus === 'paid' ? 'text-green-600' : 'text-yellow-600'}>{order.paymentStatus}</span></p>
        </div>

        {/* Actions */}
        {order.status !== 'completed' && order.status !== 'cancelled' && (
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 space-y-2">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Actions</p>
            <div className="flex flex-wrap gap-2">
              {nextStates.map((s) => (
                <button
                  key={s}
                  disabled={advancing}
                  onClick={() => advance(s)}
                  className="btn-primary text-xs capitalize"
                >
                  Mark {s}
                </button>
              ))}
              {STATUS_TRANSITIONS[order.status].includes('cancelled') && (
                <button
                  disabled={advancing}
                  onClick={() => setShowCancel(true)}
                  className="btn-danger text-xs"
                >
                  Cancel
                </button>
              )}
            </div>
            {showCancel && (
              <div className="mt-2 space-y-2">
                <input
                  className="input text-sm"
                  placeholder="Cancellation reason…"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button onClick={confirmCancel} disabled={advancing || !cancelReason.trim()} className="btn-danger text-xs flex-1">Confirm Cancel</button>
                  <button onClick={() => setShowCancel(false)} className="btn-secondary text-xs flex-1">Nevermind</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Receipt */}
        <div className="p-4 flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Receipt Preview</p>
          {receiptText ? (
            <pre className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-3 whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
              {receiptText}
            </pre>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic">Receipt will appear here once printed.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const { socket } = useSocket();
  const PAGE_SIZE = 20;

  function showToast(message: string, type: Toast['type'] = 'error') {
    const id = ++toastIdSeq;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await api.get<OrdersResponse>('/orders', { params });
      setOrders(res.data.orders);
      setTotal(res.data.total);
    } catch {
      showToast('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!socket) return;
    const handleNew = (order: Order) => {
      setOrders((prev) => [order, ...prev.filter((o) => o.id !== order.id)]);
      setNewOrderIds((prev) => new Set(prev).add(order.id));
      setTimeout(() => setNewOrderIds((prev) => { const n = new Set(prev); n.delete(order.id); return n; }), 3000);
    };
    const handleUpdated = (order: Order) => {
      setOrders((prev) => prev.map((o) => (o.id === order.id ? order : o)));
      if (selectedOrder?.id === order.id) setSelectedOrder(order);
    };
    socket.on('order:new', handleNew);
    socket.on('order:updated', handleUpdated);
    return () => { socket.off('order:new', handleNew); socket.off('order:updated', handleUpdated); };
  }, [socket, selectedOrder]);

  async function updateStatus(id: string, status: OrderStatus, reason?: string) {
    try {
      const res = await api.patch<Order>(`/orders/${id}/status`, { status, reason });
      setOrders((prev) => prev.map((o) => (o.id === id ? res.data : o)));
      if (selectedOrder?.id === id) setSelectedOrder(res.data);
      showToast(`Order marked ${status}`, 'success');
    } catch {
      showToast('Failed to update status.');
    }
  }

  const countsByStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  function onDragOver(e: React.DragEvent) { e.preventDefault(); }
  async function onDrop(e: React.DragEvent, status: OrderStatus) {
    e.preventDefault();
    if (!draggedId) return;
    const order = orders.find((o) => o.id === draggedId);
    if (!order) return;
    const allowed = STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(status)) {
      showToast(`Cannot move from ${order.status} to ${status}.`);
      return;
    }
    await updateStatus(draggedId, status);
    setDraggedId(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-4">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`text-white text-sm rounded-lg px-4 py-3 shadow-lg max-w-xs ${t.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h1>
        <div className="flex gap-2">
          <button onClick={() => setView('table')} className={view === 'table' ? 'btn-primary' : 'btn-secondary'}>Table</button>
          <button onClick={() => setView('kanban')} className={view === 'kanban' ? 'btn-primary' : 'btn-secondary'}>Kanban</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search order / customer…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="input w-48"
        />
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="input w-40" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="input w-40" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {(['all', ...STATUS_LIST] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-green-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'all' && countsByStatus[s] !== undefined && (
              <span className="ml-1 bg-white/30 px-1.5 rounded-full">{countsByStatus[s]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table view */}
      {view === 'table' && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 animate-pulse rounded" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="p-8 text-center text-gray-400">No orders found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    {['Order #', 'Customer', 'Items', 'Total', 'Status', 'Time', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                        newOrderIds.has(order.id) ? 'bg-green-50 dark:bg-green-900/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">#{order.orderNumber}</td>
                      <td className="px-4 py-3 dark:text-gray-200 whitespace-nowrap">{order.customerName}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[180px] truncate">
                        {order.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{paiseToRupees(order.total)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={STATUS_BADGE[order.status]}>{order.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">{timeAgo(order.createdAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {STATUS_TRANSITIONS[order.status].filter((s) => s !== 'cancelled').map((s) => (
                          <button key={s} onClick={() => updateStatus(order.id, s)} className="btn-secondary text-xs mr-1 capitalize">{s}</button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {total} orders, page {page} of {totalPages}
              </p>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary text-xs disabled:opacity-40">Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-xs disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_LIST.map((status) => {
            const col = orders.filter((o) => o.status === status);
            return (
              <div
                key={status}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, status)}
                className="flex-shrink-0 w-64 bg-gray-100 dark:bg-gray-700 rounded-xl p-3 min-h-[200px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={STATUS_BADGE[status]}>{status}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{col.length}</span>
                </div>
                {col.map((order) => (
                  <KanbanCard
                    key={order.id}
                    order={order}
                    onDragStart={setDraggedId}
                    onClick={setSelectedOrder}
                    flash={newOrderIds.has(order.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      {selectedOrder && (
        <OrderDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={updateStatus}
        />
      )}
    </div>
  );
}
