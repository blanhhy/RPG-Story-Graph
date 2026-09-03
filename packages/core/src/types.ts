import type { Database, MapUnit } from 'rpgrt';

/** 引擎版本：RM2K / RM2K3 */
export type EngineVersion = '2k' | '2k3';
/** 编码：rpgrt 支持的编码名 */
export type EncodingName = 'shift_jis' | 'gbk' | 'eucjp' | 'utf8' | 'latin1';

/** 剧情节点角色 */
export type NodeRole = 'code' | 'entry' | 'join' | 'return' | 'label';

/** 剧情节点：一段连续执行的非流程命令（含提取出的显示文本） */
export interface StoryNode {
  /** 节点标识：`${unit}#${序号}`，如 M1E17P1#3 */
  id: string;
  /** 执行单元：M{图}E{事件}P{页} / CE#{公共事件} / T{敌群}P{页} */
  unit: string;
  role: NodeRole;
  /** 在单元命令流中的首尾命令索引（空锚点节点为 null） */
  range: [number, number] | null;
  /** 是否携带显示文本（对话/选项/改名） */
  hasText: boolean;
  /** 该段对话摘要（选项以【选择】·选项文本展开） */
  text: string;
  /** label 锚点：声明时记录的整数 id（12110 参数[0]，goto 按同 id 匹配） */
  labelId?: number;
}

export type EdgeKind =
  | 'next' | 'branch' | 'join' | 'call' | 'return'
  | 'teleport' | 'goto' | 'terminal' | 'loop';

export interface StoryEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** call 边：调用方内的返回锚点节点 id */
  ret?: string;
  note?: string;
}

/** 一张剧情图 = 一个连通分量的节点与边 */
export interface StoryGraph {
  /** 图标识（连通分量内首个有文本节点所在单元） */
  id: string;
  /** 图标签（连通分量内首个有文本节点所在单元的标签） */
  label: string;
  /** 触发器（同上） */
  trigger: number;
  nodes: StoryNode[];
  edges: StoryEdge[];
}

/** 载入完成的游戏（解析用数据源） */
export interface LoadedGame {
  engine: EngineVersion;
  encoding: EncodingName;
  db: Database;
  /** 地图文件（MapXXXX.lmu） */
  maps: Map<number, { map: MapUnit; id: number; file: string }>;
}

/** 解析结果：模块1（建图）+ 模块2（精简）之后的全剧情图 */
export interface GameGraph {
  game: { engine: EngineVersion; encoding: EncodingName; mapCount: number };
  /** 精简后保留的剧情图（含文本） */
  graphs: StoryGraph[];
  /** 精简统计 */
  stats: {
    units: number;                    // 执行单元总数
    textUnits: number;                // 含文本单元数（= 精简前图数）
    keptGraphs: number;               // 精简后图数（有文本）
    rawNodes: number; rawEdges: number;
    nodes: number; edges: number;     // 精简后
  };
}