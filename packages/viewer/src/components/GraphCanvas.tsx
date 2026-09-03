import { useCallback, useMemo } from 'react';
import {
  Background, Handle, MarkerType, Position, ReactFlow, useReactFlow,
  type Edge, type Node, type NodeProps, type EdgeProps,
  BaseEdge, getBezierPath,
} from '@xyflow/react';
import type { StoryGraph, StoryNode } from '@storygraph/core';
import { layoutGraph } from '../layout';

/** 平行边偏移：同 (source,target) 对的多条边按 index 给垂直偏移，避免共线重叠 */
function computeEdgeOffsets(edges: Edge[]): Map<string, number> {
  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    const key = `${e.source}|${e.target}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const offsets = new Map<string, number>();
  const SPACING = 16;
  for (const arr of groups.values()) {
    if (arr.length <= 1) { offsets.set(arr[0].id, 0); continue; }
    const mid = (arr.length - 1) / 2;
    arr.forEach((e, i) => offsets.set(e.id, (i - mid) * SPACING));
  }
  return offsets;
}

/** 自定义贝塞尔边：保持起止点不变，只偏移控制点让平行边分开。
 *  LR 布局控制点沿 X 扩展、Y 偏移；TB 布局沿 Y 扩展、X 偏移。 */
function OffsetEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  style, markerEnd, data,
}: EdgeProps) {
  const offset = (data as any)?.offset ?? 0;
  const horizontal = sourcePosition === Position.Right || sourcePosition === Position.Left;
  if (horizontal) {
    const dx = targetX - sourceX;
    const cpOffset = Math.abs(dx) * 0.5;
    const path = `M${sourceX},${sourceY} C${sourceX + cpOffset},${sourceY + offset} ${targetX - cpOffset},${targetY + offset} ${targetX},${targetY}`;
    return <BaseEdge path={path} style={style} markerEnd={markerEnd} />;
  }
  const dy = targetY - sourceY;
  const cpOffset = Math.abs(dy) * 0.5;
  const path = `M${sourceX},${sourceY} C${sourceX + offset},${sourceY + cpOffset} ${targetX + offset},${targetY - cpOffset} ${targetX},${targetY}`;
  return <BaseEdge path={path} style={style} markerEnd={markerEnd} />;
}

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
const edgeTypes = { offset: OffsetEdge };

function StoryNodeCmp({ data }: NodeProps) {
  const d = data as { node?: StoryNode; isStub?: boolean; stubName?: string; isTerminal?: boolean; rankDir?: 'LR' | 'TB' };
  const horizontal = (d.rankDir ?? 'LR') === 'LR';
  const tPos = horizontal ? Position.Left : Position.Top;
  const sPos = horizontal ? Position.Right : Position.Bottom;
  if (d.isStub) {
    return (
      <div className="stub-node" title={d.stubName}>
        <Handle type="target" position={tPos} />
        {d.stubName}
        <Handle type="source" position={sPos} />
      </div>
    );
  }
  const { node, isTerminal } = d;
  if (!node || !node.hasText) {
    const role = node?.role ?? 'join';
    return (
      <div className={`anchor-node role-${role}`} title={node?.id}>
        <Handle type="target" position={tPos} />
        <Handle type="source" position={sPos} />
      </div>
    );
  }
  return (
    <div className={`story-node${isTerminal ? ' is-terminal' : ''}`}>
      <Handle type="target" position={tPos} />
      <div className="story-id">{node.id.split('#')[1]}</div>
      <div className="story-text">{textPreview(node.text) || '（无文本）'}</div>
      <Handle type="source" position={sPos} />
    </div>
  );
}

export interface GraphCanvasProps {
  graph: StoryGraph;
  rankDir?: 'LR' | 'TB';
  onSelect: (nodeId: string) => void;
}

export default function GraphCanvas({ graph, rankDir = 'LR', onSelect }: GraphCanvasProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const onZoomIn = useCallback(() => zoomIn({ duration: 150 }), [zoomIn]);
  const onZoomOut = useCallback(() => zoomOut({ duration: 150 }), [zoomOut]);
  const onFit = useCallback(() => fitView({ duration: 300 }), [fitView]);

  const { nodes, edges } = useMemo(() => {
    const pos = layoutGraph(graph, { rankdir: rankDir });
    const ids = new Set(graph.nodes.map(n => n.id));
    const terminalOf = new Set(graph.edges.filter(e => e.kind === 'terminal').map(e => e.from));

    const ns: Node[] = graph.nodes.map(n => ({
      id: n.id,
      type: 'story',
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { node: n, isTerminal: terminalOf.has(n.id), rankDir },
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
        type: 'offset',
        data: {},
        style: { stroke: st.color, strokeDasharray: st?.dash, strokeWidth: e.kind === 'next' ? 1.4 : 1.2 },
        label: e.kind === 'branch' ? '假' : '',
        labelStyle: { fill: '#9a9ba6', fontSize: 9 },
        labelBgStyle: { fill: 'transparent' },
        markerEnd: { type: MarkerType.ArrowClosed, color: st.color },
      });
    }
    // 计算平行边偏移
    const offsets = computeEdgeOffsets(es);
    for (const e of es) {
      (e.data as any).offset = offsets.get(e.id) ?? 0;
    }
    return { nodes: ns, edges: es };
  }, [graph, rankDir]);

  return (
    <div className="flow-shell">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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