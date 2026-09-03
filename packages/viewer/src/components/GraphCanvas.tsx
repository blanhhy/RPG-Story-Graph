import { useCallback, useMemo } from 'react';
import {
  Background, Handle, MarkerType, Position, ReactFlow, useReactFlow,
  type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import type { StoryGraph, StoryNode } from '@storygraph/core';
import { layoutGraph } from '../layout';

const KIND_STYLE: Record<string, { color: string; dash?: string; label?: string }> = {
  next: { color: '#8B8B98' },
  branch: { color: '#3C2ECA', dash: '6 4', label: '假' },
  join: { color: '#C08A00' },
  call: { color: '#7A3CEC', dash: '6 4' },
  return: { color: '#0F766E' },
  teleport: { color: '#E8463A', dash: '6 4' },
  goto: { color: '#52525B', dash: '2 2' },
  terminal: { color: '#171717' },
  loop: { color: '#C08A00', dash: '4 4' },
};

/** 文本摘要：去控制码，限长 */
export function textPreview(t: string, n = 56): string {
  const s = t.replace(/\\[cCsSnNvVtT]\[[^\]]*\]/g, '').replace(/\\[cC!.$|^><_]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const nodeTypes = { story: StoryNodeCmp };

function StoryNodeCmp({ data }: NodeProps) {
  const d = data as { node?: StoryNode; isStub?: boolean; stubName?: string; isTerminal?: boolean };
  if (d.isStub) {
    return (
      <div className="stub-node" title={d.stubName}>
        <Handle type="target" position={Position.Left} />
        {d.stubName}
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }
  const { node, isTerminal } = d;
  if (!node || !node.hasText) {
    const role = node?.role ?? 'join';
    return (
      <div className={`anchor-node role-${role}`} title={node?.id}>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }
  return (
    <div className={`story-node${isTerminal ? ' is-terminal' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="story-id">{node.id.split('#')[1]}</div>
      <div className="story-text">{textPreview(node.text) || '（无文本）'}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export interface GraphCanvasProps {
  graph: StoryGraph;
  onSelect: (nodeId: string) => void;
}

export default function GraphCanvas({ graph, onSelect }: GraphCanvasProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const onZoomIn = useCallback(() => zoomIn({ duration: 150 }), [zoomIn]);
  const onZoomOut = useCallback(() => zoomOut({ duration: 150 }), [zoomOut]);
  const onFit = useCallback(() => fitView({ duration: 300 }), [fitView]);

  const { nodes, edges } = useMemo(() => {
    const pos = layoutGraph(graph);
    const ids = new Set(graph.nodes.map(n => n.id));
    const terminalOf = new Set(graph.edges.filter(e => e.kind === 'terminal').map(e => e.from));

    const ns: Node[] = graph.nodes.map(n => ({
      id: n.id,
      type: 'story',
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { node: n, isTerminal: terminalOf.has(n.id) },
      draggable: false,
    }));

    // 跨图/外部引用 → 生成「桩」节点 + 桩边（双击/点击桩在详情侧栏跳转）。
    // 无目标边（图出口 return / loop 回卷 / terminal）不渲染：它们的信息由节点样式表达，
    // 空 target 桩会让 fitView 把视图缩到原点附近导致图不可见。
    const es: Edge[] = [];
    const stubSeen = new Map<string, string>();
    for (const e of graph.edges) {
      if (!e.to) continue;
      let target = e.to;
      if (!ids.has(e.to)) {
        const stubId = `stub:${e.to}`;
        if (!stubSeen.has(e.to)) {
          stubSeen.set(e.to, stubId);
          ns.push({
            id: stubId,
            type: 'story',
            position: { x: (pos.get(e.from)?.x ?? 0) + 40, y: (pos.get(e.from)?.y ?? 0) + 20 },
            data: { isStub: true, stubName: e.to.slice(0, 22) },
          });
        }
        target = stubId;
      }
      const st = KIND_STYLE[e.kind] ?? KIND_STYLE.next;
      es.push({
        id: `${e.from}|${e.to}|${e.kind}`,
        source: e.from,
        target,
        type: 'smoothstep',
        style: { stroke: st.color, strokeDasharray: st?.dash, strokeWidth: e.kind === 'next' ? 1.4 : 1.2 },
        label: st.label ?? (e.kind !== 'next' ? e.kind : ''),
        markerEnd: { type: MarkerType.ArrowClosed, color: st.color },
      });
    }
    return { nodes: ns, edges: es };
  }, [graph]);

  return (
    <div className="flow-shell">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.35, maxZoom: 1 }}
        minZoom={0.01}
        maxZoom={4}
        panOnDrag
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, n) => {
          if ((n.data as any)?.isStub) return;
          onSelect(n.id);
        }}
      >
        <Background />
      </ReactFlow>
      <div className="flow-controls">
        <button title="放大" onClick={onZoomIn} type="button">＋</button>
        <button title="缩小" onClick={onZoomOut} type="button">－</button>
        <button title="适配视图" onClick={onFit} type="button">⤢</button>
      </div>
    </div>
  );
}