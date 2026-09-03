import { useMemo } from 'react';
import type { StoryGraph } from '@storygraph/core';
import { textPreview } from './GraphCanvas';

export interface NodePanelProps {
  graph: StoryGraph;
  selected: string | null;
  onJump: (target: string) => void;
}

export default function NodePanel({ graph, selected, onJump }: NodePanelProps) {
  const node = useMemo(() => graph.nodes.find(n => n.id === selected) ?? null, [graph, selected]);
  if (!node) return <aside className="panel empty-panel">选中一个节点查看详情</aside>;

  const ins = graph.edges.filter(e => e.to === node.id);
  const outs = graph.edges.filter(e => e.from === node.id);
  const short = (id: string) => id.length > 26 ? id.slice(0, 26) + '…' : id;

  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="panel-id">{node.id}</span>
        <span className={`role-badge role-${node.role}`}>{node.role}</span>
      </div>
      {node.range && <div className="panel-range">命令 {node.range[0]}..{node.range[1]}</div>}
      <div className="panel-body">
        {node.text ? (
          <>
            <div className="panel-label">剧情文本</div>
            <div className="panel-text">{textPreview(node.text, 400)}</div>
          </>
        ) : (
          <div className="panel-label">空锚点（构建节点关系用）</div>
        )}
        <div className="panel-label">出边 · {outs.length}</div>
        <ul className="edge-list">
          {outs.map(e => (
            <li key={`${e.from}|${e.to}|${e.kind}`}>
              <span className={`ek ek-${e.kind}`}>{e.kind}</span>
              <button
                className="elink"
                onClick={() => onJump(e.to)}
                title={e.note ?? e.to}
              >
                {short(e.to) || e.note || ''}
              </button>
              {e.note && <span className="enote">{e.note}</span>}
            </li>
          ))}
          {outs.length === 0 && <li className="muted">（无）</li>}
        </ul>
        <div className="panel-label">入边 · {ins.length}</div>
        <ul className="edge-list">
          {ins.map(e => (
            <li key={`in-${e.from}|${e.to}|${e.kind}`}>
              <span className={`ek ek-${e.kind}`}>{e.kind}</span>
              <button className="elink" onClick={() => onJump(e.from)}>{short(e.from)}</button>
            </li>
          ))}
          {ins.length === 0 && <li className="muted">（无）</li>}
        </ul>
      </div>
    </aside>
  );
}