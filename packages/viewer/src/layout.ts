import dagre from 'dagre';
import type { StoryGraph } from '@storygraph/core';

/**
 * 分层方案：BFS 深度分层（广度优先）。
 * 节点入度/剧情分支的含义是"同一来源流出多个后继"——这些后继应当表现为并列的同一列，
 * 与 dagre 的"最长路径分层"（会把汇合点一路推到最右列）冲突，导致分叉看起来像线性拉长。
 * 因此 LR 布局改为：任意节点 x 列 = 从任一剧情源点出发的 BFS 深度，同列节点再按
 * barycenter（前驱列内平均序号）排序 y，减少跨列边交叉。
 */

const NODE_W = 100;
const NODE_H = 56;
const EMPTY_W = 16;
const EMPTY_H = 16;
const RANK_SEP = 28;
const NODE_SEP = 14;

function bfsDepth(g: StoryGraph): Map<string, number> {
  const depth = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!depth.has(e.to) && !g.nodes.some(n => n.id === e.to)) continue;
    const a = incoming.get(e.to) ?? [];
    a.push(e.from);
    incoming.set(e.to, a);
  }
  // 源点：无入边（或入边引用图外）的节点
  const queue: string[] = [];
  for (const n of g.nodes) {
    const ins = incoming.get(n.id);
    if (!ins || ins.length === 0) {
      depth.set(n.id, 0);
      queue.push(n.id);
    }
  }
  // BFS 逐层扩散
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const d = depth.get(cur)!;
    for (const e of g.edges) {
      if (e.from !== cur) continue;
      if (!depth.has(e.to)) {
        depth.set(e.to, d + 1);
        queue.push(e.to);
      }
    }
  }
  // 纯环余留（从任何源点不可达）：按入边最小深度 +1 兜底，仍未决的依次排后
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of g.nodes) {
      if (depth.has(n.id)) continue;
      const ins = incoming.get(n.id) ?? [];
      let md = Infinity;
      for (const f of ins) {
        const fd = depth.get(f);
        if (fd != null && fd + 1 < md) md = fd + 1;
      }
      if (md !== Infinity) { depth.set(n.id, md); changed = true; }
    }
  }
  let fallback = 0;
  for (const n of g.nodes) if (!depth.has(n.id)) depth.set(n.id, fallback++);
  return depth;
}

/** 层内排序：barycenter——按所有前驱节点（上一层）的平均序号排，迭代两轮减小交叉 */
function orderInLayer(g: StoryGraph, depth: Map<string, number>, maxDepth: number): Map<number, string[]> {
  const layers: string[][] = [];
  for (let d = 0; d <= maxDepth; d++) layers.push([]);
  for (const n of g.nodes) {
    const d = depth.get(n.id)!;
    layers[d].push(n.id);
  }
  const prevIdx = new Map<string, number>();
  for (let pass = 0; pass < 3; pass++) {
    // 重建 prevIdx：上一轮得到的每层顺序
    prevIdx.clear();
    for (const layer of layers) layer.forEach((id, i) => prevIdx.set(id, i));
    // 按层顺序计算 barycenter 并重排（从浅到深 / 深到浅交替减少抖动）
    const order = pass % 2 === 0 ? [...Array(maxDepth + 1).keys()] : [...Array(maxDepth + 1).keys()].reverse();
    for (const d of order) {
      if (d === 0) continue;
      const withBary = layers[d].map(id => {
        let sum = 0, cnt = 0;
        for (const e of g.edges) {
          if (e.to !== id) continue;
          const pi = prevIdx.get(e.from);
          if (pi != null) { sum += pi; cnt++; }
        }
        return { id, bary: cnt ? sum / cnt : -1 };
      });
      layers[d] = withBary.sort((a, b) => a.bary - b.bary).map(x => x.id);
    }
  }
  return new Map(layers.map((l, i) => [i, l]));
}

/** BFS 分层自动布局（LR）：对图内 id 引用布局，跨图字符串引用（公共事件#/Label/M..P..#0）跳过 */
export function layoutGraph(
  g: StoryGraph,
  opts: { rankdir?: 'LR' | 'TB'; nodeW?: number; nodeH?: number } = {},
): Map<string, { x: number; y: number }> {
  const { rankdir = 'LR' } = opts;
  if (rankdir !== 'LR') {
    const dag = new dagre.graphlib.Graph();
    dag.setDefaultEdgeLabel(() => ({}));
    dag.setGraph({ rankdir, nodesep: 8, ranksep: 20, marginx: 16, marginy: 16 });
    const ids = new Set(g.nodes.map(n => n.id));
    for (const n of g.nodes) dag.setNode(n.id, { width: n.hasText ? NODE_W : EMPTY_W, height: n.hasText ? NODE_H : EMPTY_H });
    for (const e of g.edges) if (ids.has(e.to) && ids.has(e.from)) dag.setEdge(e.from, e.to);
    dagre.layout(dag);
    const pos = new Map<string, { x: number; y: number }>();
    for (const n of g.nodes) {
      const p = dag.node(n.id);
      if (!p) continue;
      const w = n.hasText ? NODE_W : EMPTY_W;
      const h = n.hasText ? NODE_H : EMPTY_H;
      pos.set(n.id, { x: p.x - w / 2, y: p.y - h / 2 });
    }
    return pos;
  }

  const depth = bfsDepth(g);
  const maxDepth = Math.max(0, ...depth.values());
  const layers = orderInLayer(g, depth, maxDepth);
  const pos = new Map<string, { x: number; y: number }>();
  for (let d = 0; d <= maxDepth; d++) {
    const ids = layers.get(d) ?? [];
    for (let i = 0; i < ids.length; i++) {
      const n = g.nodes.find(n => n.id === ids[i])!;
      const w = n.hasText ? NODE_W : EMPTY_W;
      const h = n.hasText ? NODE_H : EMPTY_H;
      pos.set(n.id, {
        x: 16 + d * (NODE_W + RANK_SEP),
        y: 16 + i * (NODE_H + NODE_SEP),
      });
    }
  }
  return pos;
}