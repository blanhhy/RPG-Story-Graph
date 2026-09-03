import type { StoryGraph } from '@storygraph/core';

/** viewer 侧的游戏图（后端 /api/analyze 返回） */
export interface ViewerGameGraph {
  game: { engine: string; encoding: string; mapCount: number };
  graphs: StoryGraph[];
  stats: {
    units: number; textUnits: number; keptGraphs: number;
    rawNodes: number; rawEdges: number; nodes: number; edges: number;
  };
}

/** 图列表条目 */
export interface GraphMeta {
  graph: StoryGraph;
  /** 展示名：M0004 エンディング / CE#27 名字 */
  title: string;
  group: '地图' | '公共事件' | '战斗';
  textNodeCount: number;
}