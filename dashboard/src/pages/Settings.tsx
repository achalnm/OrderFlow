import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface TenantSettings {
  tenantName: string;
  whatsappNumber: string;
  taxRate: number; // percentage e.g. 5 = 5%
}

interface PaymentSettings {
  provider: 'mock' | 'razorpay';
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
}

interface PrinterSettings {
  type: 'mock' | 'network';
  host?: string;
  port?: number;
}

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'staff';
  isActive: boolean;
}

type Tab = 'profile' | 'payment' | 'printer' | 'team';

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

function ProfileTab({ showToast }: { showToast: (msg: string, type?: 'error' | 'success') => void }) {
  const [settings, setSettings] = useState<TenantSettings>({ tenantName: '', whatsappNumber: '', taxRate: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<TenantSettings>('/settings/tenant')
      .then((r) => setSettings(r.data))
      .catch(() => showToast('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/settings/tenant', settings);
      showToast('Settings saved.', 'success');
    } catch {
      showToast('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg" />)}</div>;

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-md">
      <div>
        <label className="label">Restaurant Name</label>
        <input
          className="input"
          value={settings.tenantName}
          onChange={(e) => setSettings({ ...settings, tenantName: e.target.value })}
          placeholder="Spice Garden"
          required
        />
      </div>
      <div>
        <label className="label">WhatsApp Number</label>
        <input
          className="input"
          value={settings.whatsappNumber}
          onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
          placeholder="+911234567890"
        />
        <p className="text-xs text-gray-400 mt-1">Include country code, e.g. +91</p>
      </div>
      <div>
        <label className="label">Tax Rate (%)</label>
        <input
          className="input"
          type="number"
          min={0}
          max={100}
          step={0.01}
          value={settings.taxRate}
          onChange={(e) => setSettings({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
          placeholder="5"
        />
      </div>
      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  );
}

function PaymentTab({ showToast }: { showToast: (msg: string, type?: 'error' | 'success') => void }) {
  const [settings, setSettings] = useState<PaymentSettings>({ provider: 'mock' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<PaymentSettings>('/settings/payment')
      .then((r) => setSettings(r.data))
      .catch(() => showToast('Failed to load payment settings.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/settings/payment', settings);
      showToast('Payment settings saved.', 'success');
    } catch {
      showToast('Failed to save payment settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-24 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg max-w-md" />;

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-md">
      <div>
        <label className="label">Payment Provider</label>
        <div className="flex gap-3">
          {(['mock', 'razorpay'] as const).map((p) => (
            <label
              key={p}
              className={`flex items-center gap-2 flex-1 border rounded-lg px-4 py-3 cursor-pointer transition-colors ${
                settings.provider === p
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={p}
                checked={settings.provider === p}
                onChange={() => setSettings({ ...settings, provider: p })}
                className="accent-green-600"
              />
              <span className="text-sm font-medium capitalize dark:text-gray-200">{p === 'mock' ? 'Mock (Test)' : 'Razorpay'}</span>
            </label>
          ))}
        </div>
      </div>

      {settings.provider === 'razorpay' && (
        <>
          <div>
            <label className="label">Razorpay Key ID</label>
            <input
              className="input"
              value={settings.razorpayKeyId ?? ''}
              onChange={(e) => setSettings({ ...settings, razorpayKeyId: e.target.value })}
              placeholder="rzp_live_xxxxxxxx"
            />
          </div>
          <div>
            <label className="label">Razorpay Key Secret</label>
            <input
              className="input"
              type="password"
              value={settings.razorpayKeySecret ?? ''}
              onChange={(e) => setSettings({ ...settings, razorpayKeySecret: e.target.value })}
              placeholder="••••••••••••••••"
            />
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-xs text-yellow-700 dark:text-yellow-400">Key secret is stored encrypted. Never share it.</p>
          </div>
        </>
      )}

      <button type="submit" disabled={saving} className="btn-primary">
        {saving ? 'Saving…' : 'Save Payment Settings'}
      </button>
    </form>
  );
}

function PrinterTab({ showToast }: { showToast: (msg: string, type?: 'error' | 'success') => void }) {
  const [settings, setSettings] = useState<PrinterSettings>({ type: 'mock', host: '', port: 9100 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get<PrinterSettings>('/settings/printer')
      .then((r) => setSettings(r.data))
      .catch(() => showToast('Failed to load printer settings.'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/settings/printer', settings);
      showToast('Printer settings saved.', 'success');
    } catch {
      showToast('Failed to save printer settings.');
    } finally {
      setSaving(false);
    }
  }

  async function testPrint() {
    setTesting(true);
    setTestResult(null);
    try {
      const orderRes = await api.post('/orders/test-print', {
        items: [{ name: 'Test Item', quantity: 1, price: 10000 }],
        customerName: 'Test Customer',
        customerPhone: '+919999999999',
      });
      const receipt =
        (orderRes.data as { receiptText?: string; receipt?: string })?.receiptText ??
        (orderRes.data as { receiptText?: string; receipt?: string })?.receipt ??
        `ORDER #TEST\n------------------------\n1x Test Item     ₹100.00\n------------------------\nTOTAL:           ₹100.00\nTax (5%):          ₹5.00\nGRAND TOTAL:     ₹105.00\n\nThank you!\nPowered by OrderFlow`;
      setTestResult(receipt);
      showToast('Test print sent.', 'success');
    } catch {
      setTestResult(
        `ORDER #TEST-PRINT\n----------------------------\n1x Test Item         ₹100.00\n----------------------------\nSubtotal:            ₹100.00\nTax (5%):              ₹5.00\nTOTAL:               ₹105.00\n\nThank you for choosing us!\nPowered by OrderFlow`
      );
      showToast('Could not reach printer. Showing preview.', 'error');
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="h-24 bg-gray-100 dark:bg-gray-700 animate-pulse rounded-lg max-w-md" />;

  return (
    <div className="space-y-5 max-w-md">
      <form onSubmit={handleSave} className="space-y-5">
        <div>
          <label className="label">Printer Type</label>
          <select
            className="input"
            value={settings.type}
            onChange={(e) => setSettings({ ...settings, type: e.target.value as 'mock' | 'network' })}
          >
            <option value="mock">Mock (Log only)</option>
            <option value="network">Network Printer (ESC/POS)</option>
          </select>
        </div>

        {settings.type === 'network' && (
          <>
            <div>
              <label className="label">Printer Host / IP</label>
              <input
                className="input"
                value={settings.host ?? ''}
                onChange={(e) => setSettings({ ...settings, host: e.target.value })}
                placeholder="192.168.1.100"
              />
            </div>
            <div>
              <label className="label">Port</label>
              <input
                className="input"
                type="number"
                value={settings.port ?? 9100}
                onChange={(e) => setSettings({ ...settings, port: parseInt(e.target.value) || 9100 })}
                placeholder="9100"
              />
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save Printer Settings'}
          </button>
          <button type="button" onClick={testPrint} disabled={testing} className="btn-secondary">
            {testing ? 'Printing…' : 'Test Print'}
          </button>
        </div>
      </form>

      {testResult && (
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Receipt Preview</p>
          <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {testResult}
          </pre>
        </div>
      )}
    </div>
  );
}

function TeamTab({ showToast }: { showToast: (msg: string, type?: 'error' | 'success') => void }) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'staff'>('staff');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get<TeamUser[]>('/settings/users');
      setUsers(res.data);
    } catch {
      showToast('Failed to load team members.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword) {
      showToast('Fill in all invite fields.');
      return;
    }
    setInviting(true);
    try {
      await api.post('/settings/users', {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        password: invitePassword,
      });
      showToast('User invited.', 'success');
      setInviteName(''); setInviteEmail(''); setInvitePassword('');
      await fetchUsers();
    } catch {
      showToast('Failed to invite user.');
    } finally {
      setInviting(false);
    }
  }

  async function updateUser(id: string, patch: Partial<Pick<TeamUser, 'role' | 'isActive'>>) {
    setUpdatingId(id);
    try {
      await api.patch(`/settings/users/${id}`, patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
      showToast('User updated.', 'success');
    } catch {
      showToast('Failed to update user.');
    } finally {
      setUpdatingId(null);
    }
  }

  const roleLabel: Record<TeamUser['role'], string> = {
    owner: 'Owner',
    manager: 'Manager',
    staff: 'Staff',
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Team list */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white text-sm">Team Members</h3>
        </div>
        {loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 animate-pulse rounded" />)}
          </div>
        ) : users.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">No team members yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {users.map((user) => (
              <div key={user.id} className={`flex items-center gap-3 px-4 py-3 ${!user.isActive ? 'opacity-50' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-bold text-sm flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm dark:text-white truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                {user.role !== 'owner' && (
                  <>
                    <select
                      value={user.role}
                      onChange={(e) => updateUser(user.id, { role: e.target.value as 'manager' | 'staff' })}
                      disabled={updatingId === user.id}
                      className="input text-xs w-28 py-1"
                    >
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </select>
                    <button
                      onClick={() => updateUser(user.id, { isActive: !user.isActive })}
                      disabled={updatingId === user.id}
                      className={`text-xs rounded-full px-2.5 py-1 font-medium transition-colors ${
                        user.isActive
                          ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                      }`}
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                )}
                {user.role === 'owner' && (
                  <span className="badge bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    {roleLabel[user.role]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite form */}
      <div className="card p-5">
        <h3 className="font-semibold text-gray-800 dark:text-white text-sm mb-4">Invite Team Member</h3>
        <form onSubmit={invite} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Priya Patel" required />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="priya@restaurant.com" required />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'manager' | 'staff')}>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
              </select>
            </div>
            <div>
              <label className="label">Temporary Password</label>
              <input className="input" type="password" value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} placeholder="Min 8 characters" required />
            </div>
          </div>
          <button type="submit" disabled={inviting} className="btn-primary">
            {inviting ? 'Inviting…' : 'Send Invite'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const { toasts, show: showToast } = useToasts();

  const tabs: { id: Tab; label: string; ownerOnly?: boolean }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'payment', label: 'Payment' },
    { id: 'printer', label: 'Printer' },
    { id: 'team', label: 'Team', ownerOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.ownerOnly || user?.role === 'owner');

  return (
    <div className="p-6 max-w-3xl">
      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`text-white text-sm rounded-lg px-4 py-3 shadow-lg max-w-xs ${t.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
            {t.message}
          </div>
        ))}
      </div>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-green-600 text-green-600 dark:text-green-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && <ProfileTab showToast={showToast} />}
      {activeTab === 'payment' && <PaymentTab showToast={showToast} />}
      {activeTab === 'printer' && <PrinterTab showToast={showToast} />}
      {activeTab === 'team' && user?.role === 'owner' && <TeamTab showToast={showToast} />}
    </div>
  );
}
