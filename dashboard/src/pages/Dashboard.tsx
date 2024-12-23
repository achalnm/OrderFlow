import React, { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type Range = 'today' | '7d' | '30d';

interface StatSummary {
  revenue: number;        // paise
  orders: number;
  aov: number;            // paise
  pendingOrders: number;
}

interface DailyRevenue {
  date: string;
  revenue: number;        // paise
}

interface HourlyOrders {
  hour: number;
  orders: number;
}

interface TopItem {
  name: string;
  count: number;
}

interface StatusBreakdown {
  status: string;
  count: number;
}

interface AnalyticsSummary {
  stats: StatSummary;
  dailyRevenue: DailyRevenue[];
  hourlyOrders: HourlyOrders[];
  topItems: TopItem[];
  statusBreakdown: StatusBreakdown[];
}

function paiseToRupees(p: number): string {
  return '₹' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({
  label,
  value,
  sub,
  color,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
      </div>
    );
  }
  return (
    <div className="card p-5">
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#EAB308',
  confirmed: '#3B82F6',
  preparing: '#F97316',
  ready: '#A855F7',
  completed: '#22C55E',
  cancelled: '#EF4444',
};

export default function Dashboard() {
  const [range, setRange] = useState<Range>('today');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AnalyticsSummary>(`/analytics/summary?range=${range}`);
      setData(res.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchData();
    socket.on('order:new', handler);
    socket.on('order:updated', handler);
    return () => {
      socket.off('order:new', handler);
      socket.off('order:updated', handler);
    };
  }, [socket, fetchData]);

  const tabs: { label: string; value: Range }[] = [
    { label: 'Today', value: 'today' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
  ];

  const lineChartData = {
    labels: data?.dailyRevenue.map((d) => d.date) ?? [],
    datasets: [
      {
        label: 'Revenue (₹)',
        data: data?.dailyRevenue.map((d) => d.revenue / 100) ?? [],
        borderColor: '#16A34A',
        backgroundColor: 'rgba(22,163,74,0.1)',
        tension: 0.4,
        fill: true,
        pointRadius: 3,
      },
    ],
  };

  const barChartData = {
    labels: data?.hourlyOrders.map((h) => `${h.hour}:00`) ?? [],
    datasets: [
      {
        label: 'Orders',
        data: data?.hourlyOrders.map((h) => h.orders) ?? [],
        backgroundColor: 'rgba(59,130,246,0.7)',
        borderRadius: 4,
      },
    ],
  };

  const topItemsData = {
    labels: data?.topItems.map((i) => i.name) ?? [],
    datasets: [
      {
        label: 'Quantity Sold',
        data: data?.topItems.map((i) => i.count) ?? [],
        backgroundColor: 'rgba(249,115,22,0.7)',
        borderRadius: 4,
      },
    ],
  };

  const donutData = {
    labels: data?.statusBreakdown.map((s) => s.status) ?? [],
    datasets: [
      {
        data: data?.statusBreakdown.map((s) => s.count) ?? [],
        backgroundColor: data?.statusBreakdown.map((s) => STATUS_COLORS[s.status] ?? '#94A3B8') ?? [],
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };

  const horizontalOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true } },
  };

  const donutOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' as const },
    },
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Analytics overview</p>
        </div>

        {/* Range tabs */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setRange(t.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                range === t.value
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Revenue"
          value={data ? paiseToRupees(data.stats.revenue) : '-'}
          sub={range === 'today' ? 'Today' : range === '7d' ? 'Last 7 days' : 'Last 30 days'}
          color="text-green-600 dark:text-green-400"
          loading={loading}
        />
        <StatCard
          label="Orders"
          value={data ? data.stats.orders.toLocaleString('en-IN') : '-'}
          color="text-blue-600 dark:text-blue-400"
          loading={loading}
        />
        <StatCard
          label="Avg Order Value"
          value={data ? paiseToRupees(data.stats.aov) : '-'}
          color="text-purple-600 dark:text-purple-400"
          loading={loading}
        />
        <StatCard
          label="Pending Orders"
          value={data ? data.stats.pendingOrders.toLocaleString('en-IN') : '-'}
          sub="Awaiting action"
          color="text-yellow-600 dark:text-yellow-400"
          loading={loading}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Revenue line chart - wide */}
        <div className="card p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Revenue Over Time
          </h2>
          {loading ? (
            <div className="h-48 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />
          ) : (
            <Line data={lineChartData} options={{ ...chartOptions, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => '₹' + v } } } }} />
          )}
        </div>

        {/* Status donut */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Orders by Status
          </h2>
          {loading ? (
            <div className="h-48 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />
          ) : data?.statusBreakdown.length ? (
            <Doughnut data={donutData} options={donutOptions} />
          ) : (
            <p className="text-sm text-gray-400 text-center mt-12">No data</p>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Orders by hour */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Orders by Hour
          </h2>
          {loading ? (
            <div className="h-48 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />
          ) : (
            <Bar data={barChartData} options={chartOptions} />
          )}
        </div>

        {/* Top items */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Top Items
          </h2>
          {loading ? (
            <div className="h-48 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />
          ) : data?.topItems.length ? (
            <Bar data={topItemsData} options={horizontalOptions} />
          ) : (
            <p className="text-sm text-gray-400 text-center mt-12">No data</p>
          )}
        </div>
      </div>
    </div>
  );
}
