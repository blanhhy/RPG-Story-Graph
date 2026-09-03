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
  // 前置折叠：同 (from,to) 平行边合并为一条（kind 优先保留更"连续"的类别：
  // next/join/loop > teleport > branch ...）。同一对节点常有多条 kind 边
  // （分支汇合 next + 条件假 branch），它们表达"无论条件真假都到达同一处"，
  // 不折叠会让空节点出入度虚高，被当成多入多出枢纽而无法短路（大串 IF 调度）。
  const KIND_PREF: EdgeKind[] = ['next', 'join', 'loop', 'teleport', 'call', 'goto', 'branch', 'return', 'terminal'];
  {
    const fold = new Map<string, MinEdge>();
    for (const e of raw.edges) {
      if (e.from === e.to) continue;
      const k = `${e.from}|${e.to}`;
      const old = fold.get(k);
      if (!old) { fold.set(k, { ...e }); continue; }
      const ki = KIND_PREF.indexOf(old.kind as EdgeKind);
      const kj = KIND_PREF.indexOf(e.kind as EdgeKind);
      const merged: MinEdge = {
        from: old.from, to: old.to,
        kind: ki <= kj ? old.kind : e.kind as EdgeKind,
        ret: old.ret ?? e.ret,
        note: e.note ?? old.note,
      };
      fold.set(k, merged);
    }
    for (const e of fold.values()) {
      edges.push(e);
      pushIdx(outIdx, e.from, e);
      pushIdx(inIdx, e.to, e);
    }
  }
  const liveOut = (id: string) => {
    const arr = outIdx.get(id) ?? [];
    // 按目标去重：短路过程中会产生大量同 (from,to) 的平行新边（最终组装才统一去重），
    // 若用原始边数参与扇出判定，会把真实分支度小的节点误判成高扇出枢纽而漏删。
    const seen = new Set<string>();
    const res: MinEdge[] = [];
    for (const e of arr) { if (dead.has(e)) continue; if (seen.has(e.to)) continue; seen.add(e.to); res.push(e); }
    return res;
  };
  const liveIn = (id: string) => {
    const arr = inIdx.get(id) ?? [];
    const seen = new Set<string>();
    const res: MinEdge[] = [];
    for (const e of arr) { if (dead.has(e)) continue; if (seen.has(e.from)) continue; seen.add(e.from); res.push(e); }
    return res;
  };

  const isRemovable = (n: StoryNode): boolean => {
    // 无文本 = 无效子图的组成部分（纯代码流位置），一律可短路
    return !n.hasText;
  };

  const outFanOutOk = (id: string, role: string, outs: MinEdge[]): boolean => {
    // 空节点 = 线，不承载剧情，理论上应全部短路。仅用一个硬上限防止
    // "多入多出枢纽"做 ins×outs 笛卡尔积时边数爆炸（如几十场景汇聚又发散）。
    // 阈值设得足够宽：正常分支枢纽（十几个入 × 几个出）都能消，
    // 只有真正的大规模扇出结构（如公共事件总调度器）才保留为占位枢纽。
    const ins = liveIn(id);
    return ins.length * outs.length <= 400;
  };

  // 分支枢纽：出边含 ≥2 条分支的空节点，若按 ins×outs 做笛卡尔积短路，会把一条
  // 线性条件链炸成 O(n²) 的完全扇出（一个文本节点连到后面所有文本节点）。保留为
  // 占位枢纽，维持"条件检查点"的语义与线性结构。两种情况需要保留：
  //  1) 多入多出（如"连续 IF"里，上一个 IF 的汇合点又兼作下一个 IF 的条件父节点）；
  //  2) 有 call 入边（子图入口即分支，如公共事件一进来就 IF——否则调用会被拆成
  //     对每个分支的重复 call，破坏"单一入口"语义）。
  const isBranchHub = (outs: MinEdge[], ins: MinEdge[]): boolean =>
    outs.filter(e => e.kind === 'branch').length >= 2 &&
    (ins.length >= 2 || ins.some(e => e.kind === 'call'));

  // 不动点精简：反复扫描并短路所有"安全"的空节点（无文本 + 扇出受限），
  // 直到无节点可删。每轮基于当前 in/out 度重新判定，避免一次性队列里
  // 因邻居合并导致度变化让某些节点被永久跳过（残留空节点）——被本轮
  // 跳过的节点会在下一轮重新判定，最终收敛到「能删的全删、超限的当枢纽保留」。
  const removed = new Set<string>();

  // ===== 整体短路：纯空连通分量 =====
  // 用户观察到的"龙须糖"式空子图：内部空节点互相连接极其复杂，但整体只通过
  // 少数几条边界边与外部（文本节点或简单空节点）相连。逐节点折叠会因内部多入多出
  // （isBranchHub）或 ins×outs 超限而卡住——但这类结构整体上等价于一条线（或一个小
  // 枢纽），根本不需要理解内部，直接把「入边界 × 出边界」直连即可。
  // 这里把每个"纯空连通分量"（仅由空节点及空→空边构成）当作一个超级节点整体坍缩。
  const collapseEmptyComponents = (): boolean => {
    const emptyIds = new Set<string>();
    for (const [id, n] of nodes) if (!n.hasText) emptyIds.add(id);
    // 空→空邻接（只走空节点之间的边）
    const adj = new Map<string, string[]>();
    for (const id of emptyIds) adj.set(id, []);
    for (const e of edges) {
      if (dead.has(e)) continue;
      if (emptyIds.has(e.from) && emptyIds.has(e.to)) {
        adj.get(e.from)!.push(e.to);
        adj.get(e.to)!.push(e.from);
      }
    }
    const visited = new Set<string>();
    let changed = false;
    for (const id of emptyIds) {
      if (visited.has(id)) continue;
      // 收集一个纯空连通分量
      const comp = new Set<string>();
      const q = [id];
      visited.add(id);
      while (q.length) {
        const cur = q.pop()!;
        comp.add(cur);
        for (const nb of adj.get(cur) ?? []) {
          if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
        }
      }
      // 边界：入边界 = 外部 → 分量内（按来源去重）；出边界 = 分量内 → 外部（按目标去重）
      const inB: MinEdge[] = [];
      const outB: MinEdge[] = [];
      const seenIn = new Set<string>();
      const seenOut = new Set<string>();
      for (const cid of comp) {
        for (const e of inIdx.get(cid) ?? []) {
          if (dead.has(e)) continue;
          if (comp.has(e.from)) continue;
          if (seenIn.has(e.from)) continue;
          seenIn.add(e.from);
          inB.push(e);
        }
        for (const e of outIdx.get(cid) ?? []) {
          if (dead.has(e)) continue;
          if (comp.has(e.to)) continue;
          if (seenOut.has(e.to)) continue;
          seenOut.add(e.to);
          outB.push(e);
        }
      }
      // call 入口保留：展开 call 会把"一次调用"拆成对每个分支的重复调用，
      // 破坏子图单一入口语义；这类留给逐节点折叠的 isBranchHub 兜底。
      if (inB.some(e => e.kind === 'call')) continue;
      // 入口/出口/孤立分量：直接删除，出边（或入边）随之悬空，图自然裂开。
      if (inB.length === 0 || outB.length === 0) {
        for (const cid of comp) {
          removed.add(cid);
          nodes.delete(cid);
          for (const e of outIdx.get(cid) ?? []) dead.add(e);
          for (const e of inIdx.get(cid) ?? []) dead.add(e);
        }
        changed = true;
        continue;
      }
      // 边界入×出可控才整体坍缩；真正的大扇出（几十入×几十出）保留为枢纽。
      if (inB.length * outB.length > 400) continue;
      for (const cid of comp) {
        removed.add(cid);
        nodes.delete(cid);
        for (const e of outIdx.get(cid) ?? []) dead.add(e);
        for (const e of inIdx.get(cid) ?? []) dead.add(e);
      }
      for (const ie of inB) {
        for (const oe of outB) {
          if (oe.to === ie.from) continue; // 自环
          let kind: EdgeKind;
          let note: string | undefined;
          if (ie.kind === 'call') { kind = 'call'; note = oe.note ?? ie.note; }
          else if (oe.kind === 'return') { kind = 'return'; note = ie.note ?? oe.note; }
          else {
            const useOut = !TRANSPARENT.has(oe.kind);
            kind = useOut ? oe.kind : ie.kind;
            note = useOut ? (oe.note ?? ie.note) : (ie.note ?? oe.note);
          }
          const ne: MinEdge = { from: ie.from, to: oe.to, kind, note, ret: ie.ret ?? oe.ret };
          edges.push(ne);
          pushIdx(outIdx, ne.from, ne);
          pushIdx(inIdx, ne.to, ne);
        }
      }
      changed = true;
    }
    return changed;
  };
  while (collapseEmptyComponents()) { /* 不动点：整体短路后可能产生新的纯空分量 */ }

  let progress = true;
  while (progress) {
    progress = false;
    // 快照本轮候选，并按 ins×outs 升序排序：先短路度小的空节点（label 链、单向中继），
    // 避免多入多出枢纽在邻居尚未消解前就度虚高、被误判保留。
    const candidates: { id: string; score: number }[] = [];
    for (const [id, n] of nodes) {
      if (!isRemovable(n)) continue;
      const outs = liveOut(id);
      const ins = liveIn(id);
      if (isBranchHub(outs, ins)) continue; // 保留分支枢纽，避免条件链扇出
      if (!outFanOutOk(id, n.role, outs)) continue;
      candidates.push({ id, score: ins.length * outs.length });
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const { id } of candidates) {
      const n = nodes.get(id);
      if (!n || removed.has(id)) continue;
      const outs = liveOut(id);
      const ins = liveIn(id);

      // 入口型多出边空节点（无入边，如初始房间分叉）：消除并丢弃出边——
      // 它只是代码入口不是剧情枢纽，删除后出边各自悬空，图自然裂开。
      if (outs.length > 1 && ins.length === 0) {
        removed.add(id);
        nodes.delete(id);
        for (const e of outIdx.get(id) ?? []) dead.add(e);
        progress = true;
        continue;
      }
      // 复检：度可能在本轮前面节点的短路中变化，此刻仍超限则延后到下一轮。
      if (isBranchHub(outs, ins)) continue; // 邻接变化后成为分支枢纽，延后
      if (!outFanOutOk(id, n.role, outs)) continue;

      removed.add(id);
      nodes.delete(id);
      // dead 所有出入边（含折叠过程中新产生的平行边），而非仅去重后的 ins/outs：
      // 若只 dead 去重代表边，平行边会成为指向已删除节点的孤儿边，仍在 in/out 索引里，
      // 把邻接度虚高、令节点被 isBranchHub 误判保留，最终留下"空→空"线性链。
      for (const e of outIdx.get(id) ?? []) dead.add(e);
      for (const e of inIdx.get(id) ?? []) dead.add(e);

      // 短路：每个入边 × 每个出边
      for (const ie of ins) {
        for (const oe of outs) {
          if (oe.to === ie.from) continue; // 自环
          // call / return 是"跨子图"边界，不能被中间空节点的分支类别覆盖：
          // call 入边应保持 call（否则调用被误写成条件分支），return 出边应保持 return。
          let kind: EdgeKind;
          let note: string | undefined;
          if (ie.kind === 'call') { kind = 'call'; note = oe.note ?? ie.note; }
          else if (oe.kind === 'return') { kind = 'return'; note = ie.note ?? oe.note; }
          else {
            const useOut = !TRANSPARENT.has(oe.kind);
            kind = useOut ? oe.kind : ie.kind;
            note = useOut ? (oe.note ?? ie.note) : (ie.note ?? oe.note);
          }
          const ne: MinEdge = {
            from: ie.from,
            to: oe.to,
            kind,
            note,
            ret: ie.ret ?? oe.ret,
          };
          edges.push(ne);
          pushIdx(outIdx, ne.from, ne);
          pushIdx(inIdx, ne.to, ne);
        }
      }
      progress = true;
    }
  }

  // 组装：去死边、去自环（平行边已在前置折叠）
  const finalEdges: MinEdge[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    if (dead.has(e) || e.from === e.to) continue;
    const k = `${e.from}|${e.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    finalEdges.push(e);
  }

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
      // B 的出度不设限：合并时 B 的所有出边都会改挂到 A（分支完整继承），
      // 无论 B 分叉出多少路都不丢失。线性判定只看 A 出度唯一 + B 入度唯一。
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