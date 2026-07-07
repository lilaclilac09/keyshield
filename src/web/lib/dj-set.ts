export interface DjTrack {
  position: number;
  track_id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number | null;
  duration?: string;
  bpm?: number | null;
  key?: string;
  cover: string;
  source_type?: string;
  spotify?: { id: string; url: string; embed?: string };
  links?: { release?: string; album?: string };
  search_query?: string;
}

export interface DjSetlist {
  id: string;
  title: string;
  subtitle?: string;
  tracks: DjTrack[];
}

export function coverUrl(cover: string): string {
  if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
  const normalized = cover.replace(/^\.?\//, '');
  if (normalized.startsWith('assets/')) return `/dj-set/${normalized}`;
  return `/dj-set/${normalized}`;
}

export async function loadSetlist(): Promise<DjSetlist> {
  const res = await fetch('/dj-set/setlist.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load setlist (${res.status})`);
  return res.json() as Promise<DjSetlist>;
}

export function fmt(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}
