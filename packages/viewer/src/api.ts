import type { ViewerGameGraph } from './types';

export async function analyzeDir(dir: string): Promise<{ ms: number; graph: ViewerGameGraph }> {
  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dir }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
  return data;
}