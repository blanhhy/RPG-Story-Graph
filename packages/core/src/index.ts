/**
 * @storygraph/core —— 剧情图核心库（模块1 建图 + 模块2 精简）
 *
 * 用法：
 *   const { analyzeGame } = require('@storygraph/core');
 *   const graph = analyzeGame('D:/Games/xxx', { simplify: true });
 */
export * from './types';
export { detectEncoding, detectEngine, makeTranscoder, readEncodingFromIni } from './encoding';
export { loadGame } from './load';
export { buildStoryGraphs, collectUnits } from './build';
export type { BuildStats, BuildCtx, ExecUnit } from './build';
export { simplifyGraph, simplifyGraphs } from './simplify';

import { loadGame } from './load';
import { buildStoryGraphs, collectUnits } from './build';
import { simplifyGraphs } from './simplify';
import type { GameGraph, StoryGraph } from './types';

/** 一站式：载入游戏 → 模块1 建图 →（可选）模块2 精简 */
export function analyzeGame(dir: string, opts: { simplify?: boolean } = {}): GameGraph {
  const loaded = loadGame(dir);
  const ctx = { loaded };
  const units = collectUnits(loaded, ctx);
  const { graphs: rawGraphs, stats } = buildStoryGraphs(units, ctx);

  const rawNodes = rawGraphs.reduce((a, g) => a + g.nodes.length, 0);
  const rawEdges = rawGraphs.reduce((a, g) => a + g.edges.length, 0);

  let kept: StoryGraph[] = rawGraphs;
  let dropped = 0;
  if (opts.simplify !== false) {
    const r = simplifyGraphs(rawGraphs);
    kept = r.kept;
    dropped = r.dropped;
  }

  return {
    game: { engine: loaded.engine, encoding: loaded.encoding, mapCount: loaded.maps.size },
    graphs: kept,
    stats: {
      units: units.length,
      textUnits: stats.textUnits,
      keptGraphs: kept.length,
      rawNodes, rawEdges,
      nodes: kept.reduce((a, g) => a + g.nodes.length, 0),
      edges: kept.reduce((a, g) => a + g.edges.length, 0),
    },
  };
}