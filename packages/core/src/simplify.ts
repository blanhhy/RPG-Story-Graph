import type { EdgeKind, NodeRole, StoryGraph, StoryNode } from './types';

/**
 * 模块2：图精简 —— 把"代码流位置"图压缩成语义可读的剧情文本图。
 *
 * 原则：
 *  1) 节点只关心"是否含文本"；空节点（entry/join/return/label）是构建节点关系的手段，
 *     精简时短路消除纯中继的空节点，让有文本的剧情节点直接相连；
 *  2) 保留三类有结构身份的锚点：entry（入口，调用/传送以 #0 为目标）、
 *     return（调用的返回锚点）、label（goto 目标）；
 *  3) 只短路"出边 ≤ 1"的空节点 —— 单向传递的中继。高扇出节点（多路分支枢纽）
 *     原样保留，避免入边×出边的笛卡尔积把边数炸掉；
 *  4) 舍弃完全没有文本的图（纯逻辑/工具页）。
 *
 * 实现上使用邻接索引 + 删除标记，避免每轮全量扫描过滤造成的 O(N·E) 退化。
 */

const TRANSPARENT: ReadonlySet<EdgeKind> = new Set(['next', 'join', 'loop']);
const KEEP_ROLES: ReadonlySet<NodeRole> = new Set(['entry', 'return', 'label']);

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
    if (n.hasText) return false;
    if (KEEP_ROLES.has(n.role)) return false;
    // role=code 的空节点：只有出边是 branch/join/next 也可以短路
    return true;
  };

  const outFanOutOk = (id: string, role: string, outs: MinEdge[]): boolean => {
    if (outs.length <= 1) return true;  // 单向中继
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
    if (outs.length > 1) continue; // 高扇出枢纽，保留

    const ins = liveIn(id);
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

  return {
    ...raw,
    nodes: [...nodes.values()],
    edges: finalEdges,
  };
}

/** 批量精简：返回保留的图 + 被舍弃（无文本）的图数量 */
export function simplifyGraphs(graphs: StoryGraph[]): { kept: StoryGraph[]; dropped: number } {
  const kept: StoryGraph[] = [];
  let dropped = 0;
  for (const g of graphs) {
    const s = simplifyGraph(g);
    if (s) kept.push(s);
    else dropped++;
  }
  return { kept, dropped };
}