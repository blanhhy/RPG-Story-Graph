import type { EventCommand } from 'rpgrt';
import type { LoadedGame, NodeRole, StoryEdge, StoryGraph, StoryNode } from './types';

// ================= 事件命令常量 =================
// 剧情终点 = 退出游戏类：GAMEOVER(12420)/TITLE(12510)/EXIT(5002 直接关程序)
// RETURN(12310) 只返回上一调用帧（连到调用方 return 锚点），不是剧情终点。
// ERASE(12320) 不打断当前执行（只删事件对象）——不作切分点。
const TERMINAL = new Set([12420, 12510, 5002]);
const RETURN_CMD = 12310;
const CALL_CMDEVT = 1005;      // 2k3 战斗解释器里的公共事件调用
const CALL_EVENT = 12330;      // 参数[0]==0 → 公共事件；其他 → 事件页
const TELEPORT = 10810;
const RECALL = 10830;          // 运行时行为，不作切分、不产生静态边
const CONTROL_SWITCHES = 10210; // 开关操作：设置开关 ON/OFF（用于识别"事件页切换"激活）
const MESSAGE = new Set([10110, 20110, 10140, 20140]); // 显示有效承载

/** 命令是否承载"非空"剧情文本。空消息（10110 但 string 为空）不算——
 *  否则会产生 hasText=true 但 text="" 的空节点，被当作"只含空节点的图"保留。 */
const isTextCmd = (c: EventCommand): boolean => {
  if (!MESSAGE.has(c.code)) return false;
  if (c.code === 10140) return true; // 显示选项：本身承载"【选择】"语义，与 string 无关
  return (c.string ?? '').trim() !== '';
};

// 块 = 连续执行的"非流程"命令（其中可含对话）。流程命令做切分点。
const FLOW = new Set([
  12010, 13310, // IF (普通/战斗)
  22010, 23310, // ELSE
  22011, 23311, // END IF
  12210,        // LOOP
  22210,        // END LOOP
  10140,        // CASE 显示选项
  20140,        // CASE 选项项
  20141,        // CASE 结束
  12110,        // LABEL
  12120,        // GOTO
  RETURN_CMD,
  10,           // End 块尾
  ...TERMINAL,
  CALL_CMDEVT, CALL_EVENT, TELEPORT,
]);

type Succ =
  | { kind: 'next'; to: string; note?: string }
  | { kind: 'branch'; to: string; note?: string }  // IF/ELSE 多候选
  | { kind: 'join'; to: string; note?: string }    // 分支/循环/选项汇合到公共
  | { kind: 'call'; to: string; ret?: string; note?: string }
  | { kind: 'return'; to?: string }                // 子图出口 → 调用方 ret 锚点（后处理填充）
  | { kind: 'teleport'; to: string; note?: string }
  | { kind: 'goto'; to: string }
  | { kind: 'terminal'; note: string }
  | { kind: 'loop'; note: string };

/** 执行单元 = 一个事件页 / 公共事件 / 战斗页 */
export interface ExecUnit {
  key: string;      // M{图}E{事件}P{页} / CE#{公共事件} / T{敌群}P{页}
  label: string;
  trigger: number;  // 事件页触发器；公共事件同 liblcf 语义
  cmds: EventCommand[];
  /** 事件页激活条件：需要的开关 id 列表（空 = 无条件，进图即按触发器运行）。
   * 有条件的事件页（如"开关12 为 ON 才出现"）不会被进图传送直接触发，
   * 而是由设置该开关的前置单元激活。 */
  condSwitchIds?: number[];
}

/** 构建上下文：仅需数据源（本工具只从游戏内显示文本出发，不依赖地图名等元数据） */
export interface BuildCtx {
  loaded: LoadedGame;
  /** 单元剧情可达性：自身含文本，或经调用链递归可达含文本单元（用于把纯工具调用透明化） */
  textReachable?: Map<string, boolean>;
  /** 地图剧情可达性：该图上是否存在含文本的自动/并行事件页（用于把纯机制传送透明化） */
  mapStoryReachable?: Map<number, boolean>;
}

/**
 * 节点 = 代码流位置 + 剧情文本。
 * 节点不持有命令对象：分析期间只记录命令区间 range，文本在收尾时按 range 一次性提取，
 * 空锚点（entry/join/return/label）没有 range、也没有文本——它们只是构建节点关系的手段，
 * 由模块2（simplify）短路消除。
 */
interface StoryBlock {
  unit: string;
  id: string;
  role: NodeRole;
  range: [number, number] | null;   // 在单元命令流中的首尾索引（空锚点节点为 null）
  hasText: boolean;
  text: string;
  succ: Succ[];
  /** label 锚点：声明时记录的整数 id（12110 参数[0]，goto 按同 id 匹配） */
  labelId?: number;
}

// ---- 收集所有执行单元（排除仅含 End/Comment/Comment2 的空页） ----
const isNoopCmd = (c: EventCommand) => c.code === 10 || c.code === 12410 || c.code === 22410;
const hasRealCmd = (cmds: EventCommand[] | undefined) => !!cmds && cmds.some(c => !isNoopCmd(c));

export function collectUnits(loaded: LoadedGame, ctx: BuildCtx): ExecUnit[] {
  const units: ExecUnit[] = [];
  const { db, maps } = loaded;
  for (const ce of db.commonevents ?? []) {
    const c = ce as any;
    if (!hasRealCmd(c.eventCommands)) continue;
    units.push({ key: `CE#${ce.id}`, label: `公共事件 #${ce.id} (${(c as any).name || ''})`, trigger: c.trigger ?? 5, cmds: c.eventCommands });
  }
  for (const [mid, { map }] of maps) {
    for (const ev of map.events ?? []) {
      const e = ev as any;
      (e.pages ?? []).forEach((pg: any, pi: number) => {
        if (!hasRealCmd(pg.eventCommands)) return;
        const trig = pg.trigger ?? 0;
        const cond = pg.condition ?? {};
        const condSwitchIds: number[] = [];
        const flags = cond.flags ?? {};
        if (flags.switchA && cond.switchAId != null) condSwitchIds.push(cond.switchAId);
        if (flags.switchB && cond.switchBId != null) condSwitchIds.push(cond.switchBId);
        units.push({
          key: `M${mid}E${e.id}P${pi + 1}`,
          label: `Map${mid} 事件${e.id} 第${pi + 1}页`,
          trigger: trig,
          cmds: pg.eventCommands,
          condSwitchIds,
        });
      });
    }
  }
  for (const tp of db.troops ?? []) {
    const troop = tp as any;
    (troop.pages ?? []).forEach((pg: any, pi: number) => {
      if (!hasRealCmd(pg.eventCommands)) return;
      units.push({ key: `T${tp.id}P${pi}`, label: `战斗事件 敌群#${tp.id} 页${pi}`, trigger: 0, cmds: pg.eventCommands });
    });
  }
  return units;
}

// ---- 剧情可达性分析 ----
// 一个执行单元"剧情可达" = 自身含显示文本，或递归调用链上可到达含文本单元。
// 换句话说：call 目标子图（可能是很多节点构成的完整子图）只要整体不含文本，
// 它就是一个纯逻辑工具函数——调用它对剧情流无影响，切分时应透明化。
const CALL_TARGETS = [CALL_CMDEVT, CALL_EVENT];

/** 解析 call 命令的目标单元 key（与 analyzeUnit 中 call 分支保持一致） */
export function callTargetKey(u: ExecUnit, c: EventCommand): string {
  if (c.code === CALL_CMDEVT) return `CE#${c.parameters?.[0] ?? 0}`;
  const p = c.parameters ?? [];
  const id = p[1]; const page = p[2] ?? 0;
  const m = u.key.match(/^M(\d+)E(\d+)P(\d+)$/);
  if (p[0] === 0) return `CE#${id}`;
  if (id === 10005) return m ? `M${m[1]}E${m[2]}P${page}` : `当前事件P${page}`;
  return `M${m ? m[1] : 0}E${id}P${page}`;
}

/** 计算所有单元的剧情可达性（记忆化 DFS，防环） */
export function computeTextReachable(units: ExecUnit[]): Map<string, boolean> {
  const keys = new Set(units.map(u => u.key));
  // 自身是否含文本
  const ownText = new Map<string, boolean>();
  for (const u of units) {
    ownText.set(u.key, u.cmds.some(isTextCmd));
  }
  // 出边：该单元调用哪些单元
  const outs = new Map<string, string[]>();
  for (const u of units) {
    const arr: string[] = [];
    for (const c of u.cmds) {
      if (!CALL_TARGETS.includes(c.code)) continue;
      const t = callTargetKey(u, c);
      if (keys.has(t)) arr.push(t);
    }
    outs.set(u.key, arr);
  }
  const memo = new Map<string, boolean>();
  const visiting = new Set<string>();

  const reach = (k: string): boolean => {
    if (ownText.get(k)) return true;              // 自身有文本 → 可达（不用再查出边）
    if (memo.has(k)) return memo.get(k)!;
    if (visiting.has(k)) return false;            // 环：先假设不可达（环内无文本已在 ownText 查过）
    visiting.add(k);
    let r = false;
    for (const nxt of outs.get(k) ?? []) {
      if (reach(nxt)) { r = true; break; }
    }
    visiting.delete(k);
    memo.set(k, r);
    return r;
  };

  const result = new Map<string, boolean>();
  for (const u of units) result.set(u.key, reach(u.key));
  return result;
}

// ---- 节点切分 ----
// 节点 = 单元内"无流程控制中断的连续命令段"。任何流程命令都是切割点；
// 分支/循环/选项的结构配对只用来做两件事：
//  1) 尾块不线性流入下一个物理块（抑制 next）
//  2) 在汇合点（END 后第一个块）记录 join 边；条件假分支记录 branch 边
// call 是节点边界但不抑制 next（返回后继续）；RETURN 后不抑制（常有 GOTO 标签区）。
/** 按命令区间提取剧情文本（不驻留命令对象，逐块一次性扫描） */
function extractDialogue(cmds: EventCommand[], range: [number, number] | null): string {
  if (!range) return '';
  const parts: string[] = [];
  for (let i = range[0]; i <= range[1]; i++) {
    const c = cmds[i];
    if (c.code === 10140) parts.push('【选择】');
    else if (c.code === 20140) parts.push(`·${c.string ?? ''}`);
    else if (c.code === 10110 || c.code === 20110) parts.push(c.string ?? '');
  }
  return parts.filter(Boolean).join(' / ');
}

interface Scope { kind: 'if' | 'loop' | 'case'; fromIdx: number; parent: StoryBlock | null; hadElse: boolean; tails: StoryBlock[]; }

function hasHardExit(b: StoryBlock): boolean {
  return b.succ.some(s => s.kind === 'goto' || s.kind === 'terminal' || s.kind === 'teleport' || s.kind === 'return');
}

// 锚点节点模型：
//   code    —— 连续的非流程命令段（含对话）
//   entry   —— 页/单元入口锚点（空）
//   join    —— 分支/循环/选项的汇合锚点（空）
//   return  —— 调用（12330/1005）的返回锚点（可能后续被代码填充）
//   label   —— 标签声明锚点
// 调用/跳转/传送等流程命令不进节点：它们是"前节点 → 目标子图 → 返回锚点"的连接边。
function analyzeUnit(u: ExecUnit, ctx: BuildCtx): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  const cmds = u.cmds;
  const scopes: Scope[] = [];
  const suppressed = new Set<StoryBlock>();
  const pendingGotos: { from: StoryBlock; id?: number }[] = [];
  let pendingFalseFrom: StoryBlock | null = null;
  // 显示选择项：show choice 前的块须 branch 到每个选项块（case 本身没有 else 语义，
  // 不能像 IF 那样只补一条假分支；需为每个选项建立一条 branch 边）。
  let pendingCaseFrom: StoryBlock | null = null;
  // show choice 前的块（case parent）：已用 branch 覆盖所有选项，收尾时不得再补 next。
  const caseParents = new Set<StoryBlock>();
  // IF 条件：真分支也应显式 branch。真分支入口用 pendingTrueFrom 关联到 if 体首块，
  // 假分支沿用 pendingFalseFrom。条件父块已发出真/假两条 branch，收尾不得再补 next。
  let pendingTrueFrom: StoryBlock | null = null;
  const ifParents = new Set<StoryBlock>();
  let cur: StoryBlock | null = null;

  const newBlock = (role: NodeRole): StoryBlock => {
    const b: StoryBlock = { unit: u.key, id: `${u.key}#${blocks.length}`, role, range: null, hasText: false, text: '', succ: [] };
    if (pendingFalseFrom) { pendingFalseFrom.succ.push({ kind: 'branch', to: b.id, note: '条件假' }); pendingFalseFrom = null; }
    if (pendingCaseFrom) { pendingCaseFrom.succ.push({ kind: 'branch', to: b.id, note: '选项' }); pendingCaseFrom = null; }
    if (pendingTrueFrom) { pendingTrueFrom.succ.push({ kind: 'branch', to: b.id, note: '条件真' }); pendingTrueFrom = null; }
    blocks.push(b);
    return b;
  };
  const close = () => { cur = null; };
  const append = (c: EventCommand, i: number) => {
    if (!cur) cur = newBlock('code');
    cur.range = cur.range ? [cur.range[0], i] : [i, i];
    if (isTextCmd(c)) cur.hasText = true;
  };
  const topScope = (k?: Scope['kind']) => scopes[scopes.length - 1] && (!k || scopes[scopes.length - 1].kind === k) ? scopes[scopes.length - 1] : null;
  const lastBlock = () => blocks[blocks.length - 1] ?? null;
  const inScope = (sc: Scope, b: StoryBlock | null) => !!b && blocks.indexOf(b) >= sc.fromIdx && b.role !== 'entry' && b.role !== 'label';

  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    const code = c.code;
    if (!FLOW.has(code)) { append(c, i); continue; }

    // 纯工具调用（目标子图剧情不可达，即无文本且调不到文本）→ 透明化：
    // call 子图相当于被删除，不打断当前对话流，命令并入当前块。
    if ((code === CALL_CMDEVT || code === CALL_EVENT) && !ctx.textReachable?.get(callTargetKey(u, c))) {
      append(c, i);
      continue;
    }

    if (code === 12010 || code === 13310 || code === 12210 || code === 10140) {
      close();
      if (blocks.length === 0) newBlock('entry');
      const parent = lastBlock();
      const kind = (code === 12210 ? 'loop' : code === 10140 ? 'case' : 'if') as Scope['kind'];
      scopes.push({ kind, fromIdx: blocks.length, parent, hadElse: false, tails: [] });
      if (kind === 'case') { pendingCaseFrom = parent; if (parent) caseParents.add(parent); }  // 每个选项块 branch 到 show choice 前的块
      else if (kind === 'if') { pendingTrueFrom = parent; if (parent) ifParents.add(parent); }  // 真分支：if 体入口 ← 条件父块
    } else if (code === 22010 || code === 23310) {
      const sc = topScope('if');
      if (sc && !sc.hadElse) {
        close();
        const tail = lastBlock();
        if (inScope(sc, tail) && !hasHardExit(tail)) sc.tails.push(tail);
        if (sc.parent && sc.parent !== tail) pendingFalseFrom = sc.parent;
        sc.hadElse = true;
      }
    } else if (code === 20140) {
      const sc = topScope('case');
      if (sc) {
        close();
        const tail = lastBlock();
        if (inScope(sc, tail) && !hasHardExit(tail)) sc.tails.push(tail);
        // 下一个选项块也应 branch 到 show choice 前的块
        pendingCaseFrom = sc.parent;
      }
    } else if (code === 22011 || code === 23311) {
      const sc = scopes.pop();
      if (sc?.kind === 'if') {
        close();
        const tail = lastBlock();
        if (inScope(sc, tail) && !hasHardExit(tail)) sc.tails.push(tail);
        if (sc.parent && !sc.hadElse) pendingFalseFrom = sc.parent;
        const join = newBlock('join');
        for (const tl of sc.tails) { suppressed.add(tl); tl.succ.push({ kind: 'join', to: join.id, note: '分支汇合' }); }
        cur = join;
      }
    } else if (code === 22210) {
      const sc = scopes.pop();
      if (sc?.kind === 'loop') {
        close();
        const tail = lastBlock();
        if (inScope(sc, tail) && !hasHardExit(tail)) {
          sc.tails.push(tail);
          tail.succ.push({ kind: 'loop', note: '循环回卷到 LOOP' });
        }
        const join = newBlock('join');
        for (const tl of sc.tails) { suppressed.add(tl); tl.succ.push({ kind: 'join', to: join.id, note: '循环退出汇合' }); }
        cur = join;
      }
    } else if (code === 20141) {
      const sc = scopes.pop();
      if (sc?.kind === 'case') {
        close();
        const join = newBlock('join');
        for (const tl of sc.tails) { suppressed.add(tl); tl.succ.push({ kind: 'join', to: join.id, note: '选项汇合' }); }
        cur = join;
      }
    } else if (code === 12120) {
      close();
      const from = lastBlock() ?? newBlock('entry');
      suppressed.add(from);
      // 引擎用整数 id（parameters[0]）匹配单元内第一个同 id 的 Label；目标标签现存块尾，收尾一起解析
      pendingGotos.push({ from, id: c.parameters?.[0] });
    } else if (code === 12110) {
      close();
      const lb = newBlock('label');
      lb.labelId = c.parameters?.[0];
      cur = lb;
    } else if (code === RETURN_CMD) {
      close();
      (lastBlock() ?? newBlock('entry')).succ.push({ kind: 'return' });
    } else if (TERMINAL.has(code)) {
      const note = code === 12420 ? 'GAMEOVER' : code === 12510 ? 'TITLE(返回标题)' : 'EXIT(退出游戏)';
      close();
      (lastBlock() ?? newBlock('entry')).succ.push({ kind: 'terminal', note });
    } else if (code === CALL_CMDEVT || code === CALL_EVENT) {
      close();
      const from = lastBlock() ?? newBlock('entry');
      const ret = newBlock('return');
      let to = ''; let note = '';
      if (code === CALL_CMDEVT) { to = `公共事件#${c.parameters?.[0] ?? 0}`; note = '调用后返回'; }
      else {
        const p = c.parameters ?? [];
        const id = p[1]; const page = p[2] ?? 0;
        const m = u.key.match(/^M(\d+)E(\d+)P(\d+)$/);
        if (p[0] === 0) { to = `公共事件#${id}`; note = '调用后返回'; }
        else if (id === 10005) { const t = m ? `M${m[1]}E${m[2]}P${page}` : `当前事件P${page}`; to = t; note = `本事件 第${page}页·调用后返回`; }
        else { to = `M${m ? m[1] : 0}E${id}P${page}`; note = `事件#${id} 第${page}页·调用后返回`; }
      }
      from.succ.push({ kind: 'call', to, ret: ret.id, note });
      suppressed.add(from);
      cur = ret;
    } else if (code === TELEPORT) {
      // 跨图传送 → 地图事件随图卸载、本页结束；公共事件跨图继续 → 保留 next。
      // 目标地图剧情不可达（没有含文本的自动/并行事件）→ 纯机制传送（走过去再回来）→ 透明化，不切分。
      // 同图传送不出边，next 兜底续上；RECALL(10830) 运行时行为，不产生静态边。
      const mapId = c.parameters?.[0];
      const m = u.key.match(/^M(\d+)E/);
      const curMid = m ? +m[1] : 0;
      const mapStory = ctx.mapStoryReachable?.get(mapId ?? -1);
      if (mapId != null && mapId !== curMid && mapStory) {
        close();
        const from = lastBlock() ?? newBlock('entry');
        const isCE = u.key.startsWith('CE#');
        from.succ.push({ kind: 'teleport', to: `Map${String(mapId).padStart(4, '0')}`, note: '换图' + (isCE ? '，公共事件跨图继续' : '') });
        if (!isCE) suppressed.add(from);
        // 传送后：地图事件对象随图卸载，但当前调用不会立即终止（官方实现里是未定义
        // 行为）；开发者仍可能留一两条清理命令（如设置开关），这些命令会继续执行。
        // 让它们 append 回传送块（而不是切出独立块），使"传送→清理→激活后续剧情"保持
        // 同一连通，避免传送块与清理块断连导致连续剧情流裂开。
        cur = from;
      }
      // 目标剧情不可达的跨图传送 / 同图传送：不打断当前对话流（透明）
    } else if (code === 10) {
      close();
    }
  }
  close();
  const last = lastBlock();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (suppressed.has(b)) { if (b === last && b.succ.length === 0) b.succ.push({ kind: 'return' }); continue; }
    if (caseParents.has(b) || ifParents.has(b)) continue;  // case/if 条件父块已显式 branch 到各分支，无线性继续
    const hasOut = b.succ.some(s => s.kind !== 'next' && s.kind !== 'join' && s.kind !== 'loop' && s.kind !== 'branch' && s.kind !== 'return');
    if (hasOut) continue;
    if (i + 1 < blocks.length) b.succ.push({ kind: 'next', to: blocks[i + 1].id });
    else b.succ.push({ kind: 'return' }); // 单元自然收尾 = 返回上一调用帧
  }
  // GOTO → 真实 label 锚点。引擎（EasyRPG CommandJumpToLabel）行为：
  // 参数[0] = 整数 id，线性扫描命令流，命中第一个 code==12110 且参数[0] 相同的 Label。
  // 与引擎一致：同 id 只匹配最先出现的 label；找不到同 id 则保持字符串桩（不可达跳转）。
  if (pendingGotos.length) {
    const firstOfId = new Map<number, string>();
    for (const b of blocks) {
      if (b.labelId == null) continue;
      if (!firstOfId.has(b.labelId)) firstOfId.set(b.labelId, b.id);
    }
    for (const g of pendingGotos) {
      const target = g.id != null ? firstOfId.get(g.id) : undefined;
      g.from.succ.push({ kind: 'goto', to: target ?? `Label#${g.id ?? '(无id)'}` });
    }
  }
  // 剧情文本：按区间一次性提取（节点只保留位置 + 文本，不驻留命令）。
  // hasText 以提取出的非空文本为准，避免空消息命令（10110 空 string）被误判为含文本。
  for (const b of blocks) {
    b.text = extractDialogue(cmds, b.range);
    b.hasText = b.text !== '';
  }
  return blocks;
}

export interface BuildStats {
  textUnits: number;
  callEdges: number;
  teleportEdges: number;
  mapEntries: Map<number, string[]>;
}

// ---- 模块1：建图（切分 + 全局后处理） ----
export function buildStoryGraphs(units: ExecUnit[], ctx: BuildCtx): { graphs: StoryGraph[]; stats: BuildStats } {
  // 剧情可达性：供 analyzeUnit 把纯工具调用透明化（不切分）
  if (!ctx.textReachable) ctx.textReachable = computeTextReachable(units);
  // 地图剧情可达性：地图上的自动(3)/并行(4)事件能推进剧情才叫"传送有剧情意义"。
  // 含文本的自动/并行页 = 剧情地图；不含文本但会连锁转移到剧情地图的自动/并行页
  // （纯中继传地图，如"走到下一张图"的过渡页）= 同一剧情链上的中继地图，也算可达。
  if (!ctx.mapStoryReachable) {
    const mapStory = new Map<number, boolean>();
    const outs = new Map<number, Set<number>>();
    for (const u of units) {
      const m = u.key.match(/^M(\d+)E(\d+)P(\d+)$/);
      if (!m) continue;
      if (u.trigger !== 3 && u.trigger !== 4) continue;
      const mid = +m[1];
      if (u.cmds.some(isTextCmd)) mapStory.set(mid, true);
      for (const c of u.cmds) {
        if (c.code !== TELEPORT) continue;
        const tId = c.parameters?.[0] as number;
        if (tId != null && tId !== mid) {
          const s = outs.get(mid) ?? new Set<number>();
          s.add(tId);
          outs.set(mid, s);
        }
      }
    }
    // 不变点传播：中继地图链末端能到剧情地图 → 沿途全是剧情地图
    let changed = true;
    while (changed) {
      changed = false;
      for (const [mid, targets] of outs) {
        if (mapStory.get(mid)) continue;
        for (const t of targets) {
          if (mapStory.get(t)) { mapStory.set(mid, true); changed = true; break; }
        }
      }
    }
    ctx.mapStoryReachable = mapStory;
  }
  const allBlocks: StoryBlock[] = [];
  const blocksByUnit = new Map<string, StoryBlock[]>();
  const callEdges: { from: string; to: string }[] = [];
  const teleportEdges: { from: string; to: string }[] = [];
  let textUnits = 0;

  for (const u of units) {
    const blocks = analyzeUnit(u, ctx);
    blocksByUnit.set(u.key, blocks);
    if (blocks.some(b => b.hasText)) textUnits++;
    for (const b of blocks) {
      allBlocks.push(b);
      for (const s of b.succ) {
        if (s.kind === 'call') callEdges.push({ from: b.id, to: s.to });
        if (s.kind === 'teleport' && s.to.startsWith('Map') && !(s.note ?? '').includes('同图')) teleportEdges.push({ from: b.id, to: s.to });
      }
    }
  }

  // 后处理1：子图出口回连 —— 被调用单元里的 RETURN 边 → 指向调用方的 ret 锚点（可能多调用者）。
  // 若调用方单元无文本（simplify 会整图丢弃、其 ret 锚点不存在），沿调用链向上透传，
  // 指向最近一个有文本（可见）的调用者的 ret；找不到可见调用者则保留无目标的出口 return。
  {
    const normKey = (to: string) => to.startsWith('公共事件#') ? `CE#${to.slice('公共事件#'.length)}` : to;
    const unitText = new Set<string>();
    for (const b of allBlocks) if (b.hasText) unitText.add(b.unit);
    const callersOf = new Map<string, { ret: string; callerUnit: string }[]>();
    for (const b of allBlocks) {
      for (const s of b.succ) {
        if (s.kind !== 'call' || !s.ret) continue;
        const key = normKey(s.to);
        const arr = callersOf.get(key) ?? [];
        arr.push({ ret: s.ret, callerUnit: b.unit });
        callersOf.set(key, arr);
      }
    }
    const resolveVisibleRet = (unit: string, retId: string, seen: Set<string>): string | null => {
      if (unitText.has(unit)) return retId;
      if (seen.has(unit)) return null;
      seen.add(unit);
      const cs = callersOf.get(unit);
      if (!cs?.length) return null;
      for (const c of cs) {
        const r = resolveVisibleRet(c.callerUnit, c.ret, new Set(seen));
        if (r) return r;
      }
      return null;
    };
    for (const b of allBlocks) {
      if (!b.succ.some(s => s.kind === 'return')) continue;
      const callers = callersOf.get(b.unit);
      const visible: string[] = [];
      for (const c of callers ?? []) {
        const t = resolveVisibleRet(c.callerUnit, c.ret, new Set());
        if (t) visible.push(t);
      }
      if (!visible.length) continue; // 无可见调用者：保留无目标出口 return
      const rest: Succ[] = b.succ.filter(s => s.kind !== 'return') as Succ[];
      b.succ = [...rest, ...visible.map(to => ({ kind: 'return', to } as Succ))];
    }
  }

  // 提取单元设置 ON 的开关 id（单个 ON op=0；范围 ON op=2）。
  // 提前定义：mapEntries（后处理2）和开关激活（后处理3）都要用。
  const setSwitchesOn = (u: ExecUnit): Set<number> => {
    const res = new Set<number>();
    for (const c of u.cmds) {
      if (c.code !== CONTROL_SWITCHES) continue;
      const p = c.parameters ?? [];
      const op = p[0]; const a = p[1]; const b = p[2] ?? a;
      if (op === 0) res.add(a);
      else if (op === 2) { for (let s = a; s <= b; s++) res.add(s); }
    }
    return res;
  };

  // 同事件页切换：条件页 B 需要开关 S，且同事件的另一页 A 设置 S（如"事件页1 说完话
  // 设置开关 → 事件页2 显示选项"）。这种 B 是页切换，应由开关激活连接（后处理3），
  // 不应被进图传送连（否则选项分支会错误地挂到上一个地图的传送源）。
  const pageSwitchKeys = new Set<string>();
  for (const u of units) {
    if (!u.condSwitchIds?.length) continue;
    const m = u.key.match(/^M(\d+)E(\d+)P(\d+)$/);
    if (!m) continue;
    const eventKey = `M${m[1]}E${m[2]}`;
    for (const other of units) {
      if (other.key === u.key) continue;
      const om = other.key.match(/^M(\d+)E(\d+)P(\d+)$/);
      if (!om || `M${om[1]}E${om[2]}` !== eventKey) continue;
      if (u.condSwitchIds.some(sid => setSwitchesOn(other).has(sid))) { pageSwitchKeys.add(u.key); break; }
    }
  }

  // 后处理2：地图间连接 —— 跨图传送边 → 目标地图上所有自动/并行事件页的入口节点。
  // 有条件页分两种：同事件页切换（pageSwitchKeys，由开关激活连接，跳过）与跨事件
  // 状态推进（主线桥梁，如"探索完自动传送"，保留进图传送以维持主线连通）。
  const mapEntries = new Map<number, string[]>();
  {
    const mapStory = ctx.mapStoryReachable!;
    for (const u of units) {
      const m = u.key.match(/^M(\d+)E(\d+)P(\d+)$/);
      if (!m) continue;
      if (u.trigger !== 3 && u.trigger !== 4) continue;
      if (pageSwitchKeys.has(u.key)) continue;  // 同事件页切换：由开关激活连接
      const mid = +m[1];
      if (!mapStory.get(mid)) continue;
      const arr = mapEntries.get(mid) ?? [];
      arr.push(`${u.key}#0`);
      mapEntries.set(mid, arr);
    }
    for (const b of allBlocks) {
      const out: Succ[] = [];
      for (const s of b.succ) {
        if (s.kind === 'teleport') {
          const mm = s.to.match(/^Map(\d{4})/);
          const mid = mm ? +mm[1] : undefined;
          const entries = mid != null ? mapEntries.get(mid) : undefined;
          if (entries?.length) {
            const ceNote = (s.note ?? '').includes('公共事件') ? '（公共事件跨图继续）' : '';
            for (const eid of entries) {
              out.push({ kind: 'teleport', to: eid, note: `换图→Map${String(mid).padStart(4, '0')}入口${ceNote}` });
            }
            continue;
          }
        }
        out.push(s);
      }
      b.succ = out;
    }
  }

  // 后处理3：开关激活连接 —— 单元 A 设置开关 S 为 ON，同地图上需要开关 S 的
  // 自动/并行条件页 B 会被激活（如"事件页1 说完话设置开关 → 事件页2 显示选项"）。
  // 建立 A 末尾块 → B 入口 的连接，让选项分支等有条件剧情挂到正确的前置单元上，
  // 而不是被进图传送（后处理2）错误地直接挂到上一个地图。
  {
    // 需要每个开关的同地图条件页：switchId -> unit keys
    const unitsBySwitch = new Map<number, string[]>();
    for (const u of units) {
      if (!u.condSwitchIds?.length) continue;
      if (u.trigger !== 3 && u.trigger !== 4) continue;
      for (const sid of u.condSwitchIds) {
        const arr = unitsBySwitch.get(sid) ?? [];
        arr.push(u.key);
        unitsBySwitch.set(sid, arr);
      }
    }
    const unitByKey = new Map(units.map(x => [x.key, x]));
    for (const u of units) {
      const switches = setSwitchesOn(u);
      if (!switches.size) continue;
      const blocks = blocksByUnit.get(u.key);
      if (!blocks?.length) continue;
      const src = blocks[blocks.length - 1];
      for (const sid of switches) {
        const targets = unitsBySwitch.get(sid) ?? [];
        for (const tkey of targets) {
          if (tkey === u.key) continue;
          // 自持开关跳过：目标页既需要 S 又自己设置 S（复制粘贴的传送中继页
          // 常这样——"进度到 S 才激活，执行完仍把 S 置 ON"）。这类页彼此没有
          // 剧情先后关系，若保留"设 S → 需 S"会形成每个中继页连到所有中继页的
          // O(n²) 完全图。跳过自持连接，只保留真正的进度推进。
          const tUnit = unitByKey.get(tkey);
          if (tUnit && setSwitchesOn(tUnit).has(sid)) continue;
          // 开关是全局状态，设置开关 S 的单元会激活任何需要 S 的条件页，
          // 不限于同地图（如"前一章说完话设置开关 → 下一章条件页激活"）。
          src.succ.push({ kind: 'next', to: `${tkey}#0`, note: '开关激活' });
        }
      }
    }
  }

  // call 目标：字符串（公共事件#66 / M1E5P2）→ 真实入口节点 id。
  // 目标单元必须含文本（否则整图被简化丢弃，目标节点不存在）。
  // 无文本目标（纯逻辑工具页）在剧情流上是"调用→立即返回"的透明环节：
  // 直接连到调用方自己的 ret 锚点（图内可见），消除跨图桩、连贯文本流。
  // 目标 #0 若为无文本 code 节点，会被 simplify 短路删除 → 强抬为 entry 锚点保留。
  const callTarget = new Map<string, string>();
  for (const u of units) {
    const bs = blocksByUnit.get(u.key);
    if (!bs?.length) continue;
    const first = bs[0];
    if (!bs.some(b => b.hasText)) continue;
    if (!first.hasText && first.role === 'code') (first as any).role = 'entry';
    callTarget.set(u.key, first.id);
  }
  const normTo = (to: string, ret?: string) => {
    if (to.startsWith('公共事件#')) return callTarget.get(`CE#${to.slice('公共事件#'.length)}`) ?? ret ?? to;
    if (/^M\d+E\d+P\d+$/.test(to)) return callTarget.get(to) ?? ret ?? to;
    return to;
  };

  const graphs: StoryGraph[] = [];
  {
    // 收集全部节点 + 边到全局池
    const allNodes: StoryNode[] = [];
    const allEdges: StoryEdge[] = [];
    for (const u of units) {
      const blocks = blocksByUnit.get(u.key);
      if (!blocks) continue;
      for (const b of blocks) {
        allNodes.push({
          id: b.id, unit: u.key, role: b.role as NodeRole, range: b.range,
          hasText: b.hasText, text: b.text, labelId: b.labelId,
        });
        for (const s of b.succ) {
          const x = s as any;
          const to = s.kind === 'call' ? normTo(x.to ?? '', x.ret) : x.to ?? '';
          if (!to) continue;
          allEdges.push({ from: b.id, to, kind: s.kind, ret: x.ret, note: x.note });
        }
      }
    }
    // 连通分量：边视为无向（teleport/call/goto 都是连接关系）
    const nodeById = new Map<string, StoryNode>(allNodes.map(n => [n.id, n]));
    const adj = new Map<string, string[]>();
    const pushAdj = (a: string, b: string) => {
      const arr = adj.get(a) ?? [];
      arr.push(b);
      adj.set(a, arr);
    };
    for (const e of allEdges) {
      if (!nodeById.has(e.from) || !nodeById.has(e.to)) continue;
      pushAdj(e.from, e.to);
      pushAdj(e.to, e.from);
    }
    const visited = new Set<string>();
    for (const n of allNodes) {
      if (visited.has(n.id)) continue;
      // BFS 收集连通分量
      const comp: string[] = [];
      const queue = [n.id];
      visited.add(n.id);
      while (queue.length) {
        const cur = queue.pop()!;
        comp.push(cur);
        for (const nb of adj.get(cur) ?? []) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
      // 该分量 → 一张 StoryGraph
      const compSet = new Set(comp);
      const compEdges = allEdges.filter(e => compSet.has(e.from) && compSet.has(e.to));
      // 去重
      const seen = new Set<string>();
      const deduped: StoryEdge[] = [];
      for (const e of compEdges) {
        const k = `${e.from}|${e.to}|${e.kind}`;
        if (seen.has(k)) continue;
        seen.add(k);
        deduped.push(e);
      }
      const compNodes = comp.map(id => nodeById.get(id)!).filter(Boolean);
      const firstText = compNodes.find(n => n.hasText);
      graphs.push({
        id: firstText?.unit ?? 'unknown',
        label: firstText?.unit ?? 'unknown',
        trigger: 0,
        nodes: compNodes,
        edges: deduped,
      });
    }
  }

  // 立即释放分析期块对象（只保留导出结构）
  blocksByUnit.clear();
  allBlocks.length = 0;

  return { graphs, stats: { textUnits, callEdges: callEdges.length, teleportEdges: teleportEdges.length, mapEntries } };
}
