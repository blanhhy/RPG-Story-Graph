import * as fs from 'fs';
import * as path from 'path';
import { decodeDatabase, decodeMapUnit } from 'rpgrt';
import type { Database, MapUnit } from 'rpgrt';
import { detectEngine, detectEncoding, makeTranscoder, readEncodingFromIni } from './encoding';
import type { EncodingName, LoadedGame } from './types';

function readBuf(dir: string, name: string): Uint8Array | null {
  try { return new Uint8Array(fs.readFileSync(path.join(dir, name))); } catch { return null; }
}

/**
 * 载入游戏目录（RPG_RT.ldb / Map*.lmu），完成引擎 + 编码检测与解码。
 * 只关心游戏内数据（数据库 + 地图事件）；RPG_RT.lmt / .ini 等
 * 非游戏运行数据不参与解码，也不提供任何显示文本。
 * 编码优先级：RPG_RT.ini [EasyRPG] Encoding 显式声明 > 自动检测。
 */
export function loadGame(dir: string): LoadedGame {
  const ldbBuf = readBuf(dir, 'RPG_RT.ldb');
  if (!ldbBuf) throw new Error(`${dir} 不是有效的 RM2K/2K3 游戏目录：缺少 RPG_RT.ldb`);

  const engine = detectEngine(ldbBuf);
  const iniBuf = readBuf(dir, 'RPG_RT.ini');
  const lmuNames = fs.readdirSync(dir).filter(f => /^Map\d{4}\.lmu$/i.test(f)).sort();
  const lmuBufs = lmuNames.map(f => new Uint8Array(fs.readFileSync(path.join(dir, f))));
  const iniEnc = readEncodingFromIni(iniBuf);
  const encoding: EncodingName = iniEnc ?? detectEncoding(ldbBuf, engine, lmuBufs);
  const t = makeTranscoder(encoding);

  const db = decodeDatabase(ldbBuf, { engine, transcoder: t }) as Database;

  const maps = new Map<number, { map: MapUnit; id: number; file: string }>();
  for (const f of lmuNames) {
    const id = parseInt(f.replace(/\D/g, ''), 10);
    try { maps.set(id, { map: decodeMapUnit(new Uint8Array(fs.readFileSync(path.join(dir, f))), { engine, transcoder: t }), id, file: f }); } catch {}
  }

  return { engine, encoding, db, maps };
}