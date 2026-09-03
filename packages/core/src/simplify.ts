import type { EdgeKind, StoryGraph, StoryNode } from './types';

/**
 * 模块2：图精简 —— 把"代码流位置"图压缩成语义可读的剧情文本图。
 *
 * 原则：
 *  1) 节点只关心"是否含文本"；任何不含文本的节点（entry/join/return/label 都算）
 *     在剧情语义上都是无效子图的组成部分——纯代码流位置，没有剧情文本承载。
 *     精简时短路消除，让有文本的剧情节点直接相连；
 *  2) 只短路"出边 ≤ 1"的空节点 —— 单向传递的中继。高扇出节点（多路分支枢纽）
 *     原样保留，避免入边×出边的笛卡尔积把边数炸掉；
 *  3) 舍弃完全没有文本的图（纯逻辑/工具页）。
 *
 * 实现上使用邻接索引 + 删除标记，避免每轮全量扫描过滤造成的 O(N·E) 退化。
 */

const TRANSPARENT: ReadonlySet<EdgeKind> = new Set(['next', 'join', 'loop']);

interface MinEdge {
  from: string; to: string; kind: EdgeKind; ret?: string; note?: string;
}

function mergeEdge(a: MinEdge, b: MinEdge): MinEdge {
  return { ...a, ret: a.ret ?? b.ret, note: b.note ?? a.note };
}

export function simplifyGraph(raw: StoryGraph): StoryGraph | null {
  // 无文本图 → 舍弃
  if (!raw.nodes.some(n => n.hasText)) return null;

  const nodes = new Map<string, StoryNode>();
  for (const n of raw.nodes) nodes.set(n.id, { ...n });

  const dead = new Set<MinEdge>();
  const edges: MinEdge[] = [];
  const outIdx = new Map<string, MinEdge[]>();
  const inIdx = new Map<string, MinEdge[]>();
  const pushIdx = (m: Map<string, MinEdge[]>, k: string, e: MinEdge) => {
    const a = m.get(k);
    if (a) a.push(e); else m.set(k, [e]);
  };
  for (const e of raw.edges) {
    const ne: MinEdge = { from: e.from, to: e.to, kind: e.kind, ret: e.ret, note: e.note };
    edges.push(ne);
    pushIdx(outIdx, ne.from, ne);
    pushIdx(inIdx, ne.to, ne);
  }
  const liveOut = (id: string) => (outIdx.get(id) ?? []).filter(e => !dead.has(e));
  const liveIn = (id: string) => (inIdx.get(id) ?? []).filter(e => !dead.has(e));

  const isRemovable = (n: StoryNode): boolean => {
    // 无文本 = 无效子图的组成部分（纯代码流位置），一律可短路
    return !n.hasText;
  };

  const outFanOutOk = (id: string, role: string, outs: MinEdge[]): boolean => {
    if (outs.length <= 1) return true;  // 单向中继
    // 无入边的多出边空节点：入口型（如初始房间分叉到各剧情房间）——
    // 它只是"代码入口"，不是剧情枢纽；消除时出边各自悬空断开，不构成剧情连通。
    {
      const ins = liveIn(id);
      if (ins.length === 0) return true;
    }
    if (role !== 'code') return false;  // 非 code 的多出边 = 结构枢纽
    // code 空节点：如果所有出边都是 branch/join/loop（无 next/teleport/goto），可以短路
    const allFlow = outs.every(e => e.kind === 'branch' || e.kind === 'join' || e.kind === 'loop');
    if (allFlow && outs.length <= 8) return true;
    return false;
  };

  // BFS 式局部更新
  const queue: string[] = [];
  const enqueued = new Set<string>();
  const enqueue = (id: string) => {
    if (enqueued.has(id)) return;
    const n = nodes.get(id);
    if (!n || !isRemovable(n)) return;
    enqueued.add(id);
    queue.push(id);
  };
  for (const [id, n] of nodes) if (isRemovable(n) && outFanOutOk(id, n.role, outIdx.get(id) ?? [])) enqueue(id);

  const removed = new Set<string>();
  while (queue.length > 0) {
    const id = queue.pop()!;
    const n = nodes.get(id);
    if (!n || removed.has(id)) continue;
    if (!isRemovable(n)) continue;
    const outs = liveOut(id);
    const ins = liveIn(id);

    // 入口型多出边空节点（无入边，如初始房间分叉）：消除并丢弃出边——
    // 它只是代码入口不是剧情枢纽，删除后出边各自悬空，图自然裂开。
    if (outs.length > 1 && ins.length === 0) {
      removed.add(id);
      nodes.delete(id);
      for (const e of outs) dead.add(e);
      continue;
    }
    if (outs.length > 1) continue; // 高扇出枢纽，保留

    removed.add(id);
    nodes.delete(id);
    for (const e of ins) dead.add(e);
    for (const e of outs) dead.add(e);

    // 短路：每个入边 × 唯一出边（最多 1 条）
    for (const ie of ins) {
      for (const oe of outs) {
        if (oe.to === ie.from) continue; // 自环
        const useOut = !TRANSPARENT.has(oe.kind);
        const ne: MinEdge = {
          from: ie.from,
          to: oe.to,
          kind: useOut ? oe.kind : ie.kind,
          note: useOut ? (oe.note ?? ie.note) : (ie.note ?? oe.note),
          ret: ie.ret ?? oe.ret,
        };
        edges.push(ne);
        pushIdx(outIdx, ne.from, ne);
        pushIdx(inIdx, ne.to, ne);
        const tn = nodes.get(ne.to);
        if (tn && isRemovable(tn)) enqueue(ne.to);
      }
    }
  }

  // 组装：去死边、去自环、同 (from,to,kind) 去重
  const finalEdges: MinEdge[] = [];
  const seen = new Map<string, MinEdge>();
  for (const e of edges) {
    if (dead.has(e) || e.from === e.to) continue;
    const k = `${e.from}|${e.to}|${e.kind}`;
    const old = seen.get(k);
    if (!old) seen.set(k, e);
    else {
      const merged = mergeEdge(old, e);
      if (merged.ret !== old.ret || merged.note !== old.note) seen.set(k, merged);
    }
  }
  for (const e of seen.values()) finalEdges.push(e);

  return mergeLinearTextNodes({
    ...raw,
    nodes: [...nodes.values()],
    edges: finalEdges,
  });
}

/**
 * 线性文本节点合并：文本节点 A --边--> 文本节点 B，且 A 无其他出边、B 无其他入边时，
 * 说明把两者切开的传送/跳转并未产生任何剧情分支——它们本就是同一段连续的剧情流，
 * 只是被流程命令物理切分。此时合并为单节点（文本拼接），避免"剧情节点线性互连"的冗余结构。
 * 环（A↔B 互相接续）同样适用：合并后残余的指向自身的自环被清除。
 */
function mergeLinearTextNodes(graph: StoryGraph): StoryGraph {
  let nodes = graph.nodes.map(n => ({ ...n }));
  let edges = graph.edges.map(e => ({ ...e }));

  let changed = true;
  while (changed) {
    changed = false;
    const ins = new Map<string, number>();
    const outs = new Map<string, number>();
    for (const e of edges) {
      if (e.from === e.to) continue;
      outs.set(e.from, (outs.get(e.from) ?? 0) + 1);
      ins.set(e.to, (ins.get(e.to) ?? 0) + 1);
    }
    const nodeOf = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      if (e.from === e.to) continue;
      const A = nodeOf.get(e.from);
      const B = nodeOf.get(e.to);
      if (!A || !B || !A.hasText || !B.hasText) continue;
      if ((outs.get(A.id) ?? 0) !== 1) continue; // A 有分支，保留
      if ((ins.get(B.id) ?? 0) !== 1) continue;  // B 有汇合，保留
      // 合并：B 的文本并入 A，B 的出边改挂到 A，B 节点删除
      A.text = [A.text, B.text].filter(Boolean).join(' / ');
      for (const oe of edges) {
        if (oe.from !== B.id) continue;
        if (oe.to === A.id) continue; // 环返回边 → 自环，丢弃
        oe.from = A.id;
      }
      edges = edges.filter(x => x !== e && x.from !== B.id);
      nodes = nodes.filter(n => n.id !== B.id);
      changed = true;
      break;
    }
  }
  return { ...graph, nodes, edges: edges.filter(e => e.from !== e.to) };
}

/** 批量精简：返回保留的图 + 被舍弃（无文本）的图数量。
 *  精简后裂开的图拆为多个连通分量。 */
export function simplifyGraphs(graphs: StoryGraph[]): { kept: StoryGraph[]; dropped: number } {
  const kept: StoryGraph[] = [];
  let dropped = 0;
  for (const g of graphs) {
    const s = simplifyGraph(g);
    if (!s) { dropped++; continue; }
    // 精简后可能有多个连通分量（入口空节点消除导致图裂开）→ 拆开
    const nodeById = new Map(s.nodes.map(n => [n.id, n]));
    const adj = new Map<string, string[]>();
    for (const e of s.edges) {
      if (!nodeById.has(e.from) || !nodeById.has(e.to)) continue;
      const a = adj.get(e.from) ?? []; a.push(e.to); adj.set(e.from, a);
      const b = adj.get(e.to) ?? []; b.push(e.from); adj.set(e.to, b);
    }
    const visited = new Set<string>();
    for (const n of s.nodes) {
      if (visited.has(n.id)) continue;
      const comp: string[] = [];
      const q = [n.id]; visited.add(n.id);
      while (q.length) {
        const cur = q.pop()!; comp.push(cur);
        for (const nb of adj.get(cur) ?? []) { if (!visited.has(nb)) { visited.add(nb); q.push(nb); } }
      }
      const compSet = new Set(comp);
      const compNodes = comp.map(id => nodeById.get(id)!).filter(Boolean);
      if (!compNodes.some(n => n.hasText)) continue; // 无文本分量舍弃
      const compEdges = s.edges.filter(e => compSet.has(e.from) && compSet.has(e.to));
      const firstText = compNodes.find(n => n.hasText);
      kept.push({
        ...s,
        id: firstText?.unit ?? compNodes[0]?.unit ?? 'unknown',
        label: firstText?.unit ?? 'unknown',
        nodes: compNodes,
        edges: compEdges,
      });
    }
  }
  return { kept, dropped };
}