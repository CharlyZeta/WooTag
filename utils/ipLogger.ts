
const LOG_KEY = 'wootag_sl';
const IP_CACHE_KEY = 'wootag_ip_cache';
const IP_TTL = 30 * 60 * 1000;

interface LogEntry {
  t: number;
  type: string;
  ip: string;
  meta?: Record<string, unknown>;
}

let memIp: string | null = null;

const resolveIp = async (): Promise<string> => {
  if (memIp) return memIp;
  try {
    const cached = localStorage.getItem(IP_CACHE_KEY);
    if (cached) {
      const { ip, ts } = JSON.parse(cached);
      if (Date.now() - ts < IP_TTL) {
        memIp = ip;
        return ip;
      }
    }
  } catch { /* ignore */ }

  try {
    const r = await fetch('https://api.ipify.org?format=json');
    if (r.ok) {
      const { ip } = await r.json();
      memIp = ip;
      try { localStorage.setItem(IP_CACHE_KEY, JSON.stringify({ ip, ts: Date.now() })); } catch { /* quota */ }
      return ip;
    }
  } catch { /* offline */ }
  return 'unknown';
};

const persist = (entries: LogEntry[]) => {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-200))); } catch { /* quota */ }
};

const load = (): LogEntry[] => {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

export const logEvent = async (type: string, meta?: Record<string, unknown>): Promise<void> => {
  const ip = await resolveIp();
  const entry: LogEntry = { t: Date.now(), type, ip, meta };
  const entries = load();
  entries.push(entry);
  persist(entries);
  console.warn('[SL]', entry);
};

export const getSecurityLog = (): LogEntry[] => load();
