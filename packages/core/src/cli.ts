import * as fs from 'fs';
import * as path from 'path';
import { buildStoryGraphs, collectUnits } from './build';
import { loadGame } from './load';
import { simplifyGraphs } from './simplify';
import type { StoryGraph } from './types';

const args = process.argv.slice(2);
const dir = args[0];
if (!dir) {
  console.error('用法: storygraph <游戏目录> [--json <输出路径>] [--no-simplify]');
  process.exit(1);
}
const jsonIdx = args.indexOf('--json');
const outPath = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const noSimplify = args.includes('--no-simplify');

const loaded = loadGame(dir);
console.log(`引擎=${loaded.engine} 编码=${loaded.encoding} 地图=${loaded.maps.size}`);

const memOf = () => `[MEM] RSS=${Math.round(process.memoryUsage().rss / 1048576)}MB heap=${Math.round(process.memoryUsage().heapUsed / 1048576)}MB`;
console.log(`${memOf()} · 载入完成`);
const units = collectUnits(loaded, { loaded });
console.log(`${memOf()} · 收集单元`);
const { graphs: rawGraphs, stats } = buildStoryGraphs(units, { loaded });
console.log(`${memOf()} · 建图完成`);

const rawNodes = rawGraphs.reduce((a, g) => a + g.nodes.length, 0);
const rawEdges = rawGraphs.reduce((a, g) => a + g.edges.length, 0);
console.log(`执行单元: ${units.length}（含文本 ${stats.textUnits}）`);
console.log(`原始剧情图: ${rawGraphs.length} 张 · 节点 ${rawNodes}（含文本 ${rawGraphs.reduce((a, g) => a + g.nodes.filter(n => n.hasText).length, 0)}）· 边 ${rawEdges}`);
console.log(`调用边: ${stats.callEdges} | 传送边: ${stats.teleportEdges}`);

let kept: StoryGraph[] = rawGraphs;
let dropped = 0;
if (!noSimplify) {
  console.log(`${memOf()} · 开始精简`);
  const r = simplifyGraphs(rawGraphs);
  console.log(`${memOf()} · 精简完成`);
  kept = r.kept;
  dropped = r.dropped;
  const keptNodes = kept.reduce((a, g) => a + g.nodes.length, 0);
  const keptEdges = kept.reduce((a, g) => a + g.edges.length, 0);
  const keptText = kept.reduce((a, g) => a + g.nodes.filter(n => n.hasText).length, 0);
  console.log(`精简: 舍弃无文本图 ${dropped} 张 · 剩 ${kept.length} 张（节点 ${keptNodes} · 边 ${keptEdges} · 文本节点 ${keptText}）`);
}

if (outPath) {
  const keptNodes = kept.reduce((a, g) => a + g.nodes.length, 0);
  const keptEdges = kept.reduce((a, g) => a + g.edges.length, 0);
  const out = {
    game: { engine: loaded.engine, encoding: loaded.encoding, mapCount: loaded.maps.size },
    graphs: kept,
    stats: {
      units: units.length,
      textUnits: stats.textUnits,
      keptGraphs: kept.length,
      rawNodes, rawEdges,
      nodes: keptNodes, edges: keptEdges,
    },
  };
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(out, null, 2), 'utf8');
  console.log(`已导出剧情图 → ${path.resolve(outPath)}`);
}
// 内存观察点：解析结束后的常驻内存（粗粒度，用于排查峰值来源）
const mb = Math.round(process.memoryUsage().rss / 1024 / 1024);
const heap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
console.log(`[MEM] RSS ≈ ${mb} MB · heapUsed ≈ ${heap} MB`);