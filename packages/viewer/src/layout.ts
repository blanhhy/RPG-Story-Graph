import dagre from 'dagre';
import type { StoryGraph } from '@storygraph/core';

/** dagre 自动布局（LR）：只对图内 id 引用布局，跨图字符串引用（公共事件#/Label/M..P..#0）不参与 */
export function layoutGraph(
  g: StoryGraph,
  opts: { rankdir?: 'LR' | 'TB'; nodeW?: number; nodeH?: number } = {},
): Map<string, { x: number; y: number }> {
  const { rankdir = 'LR', nodeW = 148, nodeH = 44 } = opts;
  const dag = new dagre.graphlib.Graph();
  dag.setDefaultEdgeLabel(() => ({}));
  dag.setGraph({ rankdir, nodesep: 14, ranksep: 34, marginx: 16, marginy: 16 });
  const ids = new Set(g.nodes.map(n => n.id));
  for (const n of g.nodes) dag.setNode(n.id, { width: n.hasText ? nodeW : 26, height: n.hasText ? nodeH : 26 });
  for (const e of g.edges) if (ids.has(e.to) && ids.has(e.from)) dag.setEdge(e.from, e.to);
  dagre.layout(dag);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of g.nodes) {
    const p = dag.node(n.id);
    if (!p) continue;
    const w = n.hasText ? nodeW : 26;
    const h = n.hasText ? nodeH : 26;
    pos.set(n.id, { x: p.x - w / 2, y: p.y - h / 2 });
  }
  return pos;
}