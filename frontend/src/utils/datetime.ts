import dayjs from 'dayjs';

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(value);
}

export function remainingText(expiresAt?: string | null): string {
  if (!expiresAt) return '—';
  const ms = dayjs(expiresAt).valueOf() - Date.now();
  if (Number.isNaN(ms)) return '—';
  if (ms <= 0) return '已到期';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `剩余 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 48) return `剩余 ${hours} 小时 ${restMinutes} 分`;
  return `剩余 ${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}
