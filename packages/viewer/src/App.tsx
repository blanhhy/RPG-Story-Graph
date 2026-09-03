import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { analyzeDir } from './api';
import type { GraphMeta, ViewerGameGraph } from './types';
import GraphCanvas from './components/GraphCanvas';
import NodePanel from './components/NodePanel';
import Sidebar from './components/Sidebar';
import './App.css';

const stem = (u: string) => u.split('#')[0];

export default function App() {
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [game, setGame] = useState<ViewerGameGraph | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [rankDir, setRankDir] = useState<'LR' | 'TB'>('LR');
  const rfKey = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  /** 加载已导出的剧情图 JSON（--json 输出），跳过重新解析 */
  const onLoadJson = useCallback(async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.graphs)) throw new Error('JSON 结构不正确：缺少 graphs 数组');
      setGame(data as ViewerGameGraph);
      setElapsed(null); setError(''); setSelected(null); setCurrent(null);
      rfKey.current++;
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  const metas = useMemo<GraphMeta[]>(() => {
    if (!game) return [];
    return game.graphs.map(g => {
      const group = g.id.startsWith('CE#') ? '公共事件' : g.id.startsWith('M') ? '地图' : '战斗';
      // 标题 = 位置标识 + 该图首个显示文本摘要（本工具只关心游戏内显示文本）
      const first = g.nodes.find(n => n.hasText)?.text ?? '';
      const firstLine = first.replace(/\\[cCsSnNvVtT]\[[^\]]*\]/g, '').replace(/\\[cC!.$|^><_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 18);
      const title = firstLine ? `${g.id} · ${firstLine}` : g.id;
      return {
        graph: g, title, group,
        textNodeCount: g.nodes.filter(n => n.hasText).length,
      };
    });
  }, [game]);

  const currentGraph = useMemo(
    () => game?.graphs.find(g => g.id === current) ?? null,
    [game, current],
  );

  // 默认选中第一张图
  useEffect(() => {
    if (game && metas.length && !current) setCurrent(metas[0].graph.id);
  }, [game, metas, current]);

  const run = useCallback(async () => {
    if (!dir.trim()) return;
    setBusy(true); setError(''); setSelected(null); setCurrent(null);
    try {
      const r = await analyzeDir(dir.trim());
      setGame(r.graph);
      setElapsed(r.ms);
      rfKey.current++;
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setGame(null);
    } finally {
      setBusy(false);
    }
  }, [dir]);

  const jump = useCallback((target: string) => {
    // 目标节点所在图：按节点 id 前缀匹配图 id
    const targetGraph = game?.graphs.find(g => g.nodes.some(n => n.id === target));
    if (targetGraph) {
      setCurrent(targetGraph.id);
      if (targetGraph.nodes.some(n => n.id === target)) setSelected(target);
      return;
    }
    // 同图内节点
    setSelected(target);
  }, [game]);

  const stats = game?.stats;

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">RPG Story Graph</div>
        <input
          className="dir-input"
          value={dir}
          onChange={e => setDir(e.target.value)}
          placeholder="游戏目录，如 D:\Games\xxx"
          onKeyDown={e => e.key === 'Enter' && run()}
        />
        <button onClick={run} disabled={busy || !dir.trim()}>
          {busy ? '解析中…' : '解析'}
        </button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>加载 JSON</button>
        <div className="rank-toggle" title="排列方向">
          <button
            className={rankDir === 'LR' ? 'active' : ''}
            onClick={() => setRankDir('LR')}
          >横向</button>
          <button
            className={rankDir === 'TB' ? 'active' : ''}
            onClick={() => setRankDir('TB')}
          >纵向</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={e => { onLoadJson(e.target.files?.[0] ?? undefined); e.target.value = ''; }}
        />
        {stats && (
          <div className="stats">
            {stats.keptGraphs} 图 · {stats.nodes} 节点 · {stats.edges} 边
            {elapsed != null && ` · ${(elapsed / 1000).toFixed(1)}s`}
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </header>
      <div className="main">
        <Sidebar metas={metas} current={current} onPick={u => { setCurrent(u); setSelected(null); }} />
        <div className="canvas-wrap" key={rfKey.current}>
          {currentGraph ? (
            <ReactFlowProvider>
              <GraphCanvas graph={currentGraph} rankDir={rankDir} onSelect={setSelected} />
            </ReactFlowProvider>
          ) : (
            <div className="placeholder">
              {busy ? '正在解析剧情图…' : '输入游戏目录后点击「解析」'}
            </div>
          )}
        </div>
        {currentGraph && <NodePanel graph={currentGraph} selected={selected} onJump={jump} />}
      </div>
    </div>
  );
}