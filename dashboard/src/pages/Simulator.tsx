import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../api/client';

interface ChatMessage {
  id: string;
  from: 'user' | 'bot';
  text: string;
  options?: string[];
  timestamp: Date;
}

function extractOrderId(text: string): string | null {
  const match = text.match(/\/pay\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function parseReplies(replies: unknown[]): ChatMessage[] {
  return replies.map((r, i) => {
    const replyObj = r as { text?: string; body?: string; options?: string[] };
    const raw = replyObj.text ?? replyObj.body ?? String(r);
    const optionPattern = /\n(\d+\..+)$/ms;
    const hasInlineOptions = optionPattern.test(raw);
    let text = raw;
    let options: string[] = replyObj.options ?? [];
    if (hasInlineOptions && options.length === 0) {
      const lines = raw.split('\n');
      const optLines: string[] = [];
      const msgLines: string[] = [];
      for (const line of lines) {
        if (/^\d+\./.test(line.trim())) optLines.push(line.trim());
        else msgLines.push(line);
      }
      text = msgLines.join('\n').trim();
      options = optLines;
    }
    return {
      id: `bot-${Date.now()}-${i}`,
      from: 'bot',
      text,
      options: options.length > 0 ? options : undefined,
      timestamp: new Date(),
    };
  });
}

function renderWithLinks(text: string): React.ReactNode[] {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    const url = match[0];
    parts.push(
      <a key={`u${match.index}`} href={url} target="_blank" rel="noopener noreferrer"
         className="underline break-all cursor-pointer opacity-90 hover:opacity-100">
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) parts.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex)}</span>);
  return parts;
}

let msgIdSeq = 0;

export default function Simulator() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [phone, setPhone] = useState('+919999999999');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [simSocket, setSimSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!tenantSlug.trim()) return;
    const token = localStorage.getItem('accessToken');
    const s = io('/simulator', {
      auth: { token },
      query: { tenantSlug: tenantSlug.trim() },
      transports: ['websocket', 'polling'],
    });
    s.on('connect', () => {
      setConnected(true);
      if (phone.trim()) s.emit('subscribe-phone', phone.trim());
    });
    s.on('disconnect', () => setConnected(false));
    s.on('bot:reply', (data: { replies: unknown[] }) => {
      const newMsgs = parseReplies(data.replies);
      setMessages((prev) => [...prev, ...newMsgs]);
    });
    setSimSocket(s);
    return () => { s.disconnect(); setConnected(false); };
  }, [tenantSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !tenantSlug.trim()) {
      if (!tenantSlug.trim()) showToast('Enter a tenant slug first.');
      return;
    }
    const userMsg: ChatMessage = {
      id: `user-${++msgIdSeq}`,
      from: 'user',
      text: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setSending(true);
    try {
      const res = await api.post<{ replies: unknown[] }>(
        `/simulator/${tenantSlug.trim()}/message`,
        { phone: phone.trim(), text: text.trim() }
      );
      const botMsgs = parseReplies(res.data.replies);
      setMessages((prev) => [...prev, ...botMsgs]);
    } catch {
      showToast('Failed to send message.');
    } finally {
      setSending(false);
    }
  }, [tenantSlug, phone]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  }

  function clickOption(option: string) {
    const match = option.match(/^\d+\.\s*(.+)/);
    const text = match ? option.split('.')[0].trim() : option;
    sendMessage(text);
  }

  const lastBotWithPayment = [...messages].reverse().find(
    (m) => m.from === 'bot' && extractOrderId(m.text) !== null
  );
  const paymentOrderId = lastBotWithPayment ? extractOrderId(lastBotWithPayment.text) : null;

  async function simulatePayment(status: 'paid' | 'failed') {
    if (!paymentOrderId || !tenantSlug.trim()) return;
    try {
      await api.post(`/simulator/${tenantSlug.trim()}/simulate-payment`, {
        orderId: paymentOrderId,
        status,
      });
      const note: ChatMessage = {
        id: `sys-${++msgIdSeq}`,
        from: 'bot',
        text: `[System] Payment ${status === 'paid' ? 'succeeded ✓' : 'failed ✗'} for order ${paymentOrderId}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, note]);
    } catch {
      showToast('Failed to simulate payment.');
    }
  }

  function clearChat() {
    setMessages([]);
  }

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 dark:bg-gray-900">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-red-600 text-white text-sm rounded-lg px-4 py-3 shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* WhatsApp-style header */}
      <div className="bg-green-700 dark:bg-green-900 text-white px-4 py-3 flex items-center gap-3 shadow-md flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-sm font-bold text-white">Bot</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base">Bot Test (Simulator)</p>
          <p className="text-xs text-green-200 flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-300' : 'bg-gray-400'}`} />
            {connected ? 'Socket connected' : 'Socket disconnected'}
          </p>
        </div>
        <button onClick={clearChat} title="Clear chat" className="text-green-200 hover:text-white text-xs">Clear</button>
      </div>

      {/* Config bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex flex-wrap gap-3 items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Tenant Slug</label>
          <input
            className="input text-xs w-36 py-1"
            placeholder="my-restaurant"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Phone</label>
          <input
            className="input text-xs w-40 py-1"
            placeholder="+919999999999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {paymentOrderId && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500 dark:text-gray-400">Order: {paymentOrderId}</span>
            <button onClick={() => simulatePayment('paid')} className="btn-primary text-xs py-1">Simulate Payment Success</button>
            <button onClick={() => simulatePayment('failed')} className="btn-danger text-xs py-1">Simulate Payment Failure</button>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d1fae5' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 mt-16">
            <p className="text-sm">Send a message to start the conversation.</p>
            <p className="text-xs mt-1">Make sure to set the tenant slug above.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] ${msg.from === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
              <div
                className={`px-3 py-2 rounded-2xl text-sm shadow-sm whitespace-pre-wrap ${
                  msg.from === 'user'
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-tr-none'
                    : 'bg-green-500 text-white rounded-tl-none'
                }`}
              >
                {renderWithLinks(msg.text)}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 px-1">{formatTime(msg.timestamp)}</span>

              {/* Options chips */}
              {msg.from === 'bot' && msg.options && msg.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {msg.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => clickOption(opt)}
                      className="bg-white dark:bg-gray-700 border border-green-400 text-green-700 dark:text-green-300 text-xs rounded-full px-3 py-1 hover:bg-green-50 dark:hover:bg-gray-600 transition-colors shadow-sm"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-green-500 text-white px-3 py-2 rounded-2xl rounded-tl-none text-sm shadow-sm">
              <span className="flex gap-1">
                <span className="animate-bounce delay-0">•</span>
                <span className="animate-bounce delay-100">•</span>
                <span className="animate-bounce delay-200">•</span>
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          className="input flex-1"
          disabled={sending}
        />
        <button
          onClick={() => sendMessage(inputText)}
          disabled={sending || !inputText.trim()}
          className="btn-primary w-10 h-10 !p-0 flex-shrink-0 rounded-full disabled:opacity-50"
          aria-label="Send"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
