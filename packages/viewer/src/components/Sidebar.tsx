import { useMemo, useState } from 'react';
import type { GraphMeta } from '../types';

export interface SidebarProps {
  metas: GraphMeta[];
  current: string | null;   // 当前图 unit
  onPick: (unit: string) => void;
}

const GROUP_ORDER = ['地图', '公共事件', '战斗'] as const;

export default function Sidebar({ metas, current, onPick }: SidebarProps) {
  const [kw, setKw] = useState('');
  const filtered = useMemo(() => {
    if (!kw.trim()) return metas;
    const q = kw.toLowerCase();
    return metas.filter(m => m.title.toLowerCase().includes(q) || m.graph.id.toLowerCase().includes(q));
  }, [metas, kw]);

  const groups = useMemo(() => {
    const m: Record<string, GraphMeta[]> = { 地图: [], 公共事件: [], 战斗: [] };
    for (const x of filtered) (m[x.group] ?? m.地图).push(x);
    return m;
  }, [filtered]);

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索图 / 事件…" />
      </div>
      <div className="sidebar-groups">
        {GROUP_ORDER.map(g => {
          const list = groups[g];
          if (!list?.length) return null;
          return (
            <div key={g} className="group">
              <div className="group-title">{g} · {list.length}</div>
              {list.map(m => (
                <button
                  key={m.graph.id}
                  className={`graph-item${current === m.graph.id ? ' active' : ''}`}
                  onClick={() => onPick(m.graph.id)}
                  title={m.graph.label}
                >
                  <span className="gi-title">{m.title}</span>
                  <span className="gi-meta">{m.textNodeCount} 文本节点</span>
                </button>
              ))}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="empty">无匹配图</div>}
      </div>
    </aside>
  );
}