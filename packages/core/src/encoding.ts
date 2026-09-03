import iconv from 'iconv-lite';
import { decodeDatabase, decodeMapUnit, EventCommandCode } from 'rpgrt';
import type { Database, MapUnit, Transcoder } from 'rpgrt';
import type { EncodingName, EngineVersion } from './types';
import commonHanziList from './commonHanzi.json';

/** 按指定编码构造 rpgrt 用的转码器 */
export function makeTranscoder(enc: string): Transcoder {
  return {
    decode(bytes: Uint8Array): string { return iconv.decode(bytes, enc); },
    encode(str: string): Uint8Array { return new Uint8Array(iconv.encode(str, enc)); },
  };
}

/**
 * 引擎检测（EasyRPG 方法）：database.system.ldb_id 2003=RPG2k3、0=RPG2k；classes 数量兜底。
 */
export function detectEngine(ldbBuf: Uint8Array): EngineVersion {
  try {
    const probe = decodeDatabase(ldbBuf, { engine: '2k' });
    const sys = probe.system as { ldbId?: number } | undefined;
    if (sys?.ldbId === 2003) return '2k3';
    if (probe.classes?.length > 0) return '2k3';
    return '2k';
  } catch {
    return '2k3';
  }
}

// 500 个最常见汉字（由 rm200x-material-manager 扫描 51 个 RM 游戏实际文本统计得出），
// 仅用于编码推断中的汉字常用度评分。
const COMMON_HANZI = new Set<string>(commonHanziList as string[]);

interface CharStats {
  neutral: number;
  other: number;        // 真正的乱码字节（无法归入任何语言的有效字符）
  languageTotal: number;
  hasKana: boolean; hasKanji: boolean; hasPunct: boolean;
  commonHanzi: number; totalHanzi: number; maxHanziRun: number;
  fullKana: number; halfKana: number;
}

/**
 * 统计文本中"有语言判别能力"的字符构成。
 * 语言判别只关心三类字符——汉字、假名、乱码字节；其余 ASCII/全角标点/符号等
 * 是东亚语言共享的"中性"字符，排除在分母之外以免稀释汉字/假名占比。
 */
function scoreCharStats(text: string): CharStats {
  let neutral = 0, other = 0;
  let hasKana = false, hasKanji = false, hasPunct = false;
  let commonHanzi = 0, totalHanzi = 0;
  let maxHanziRun = 0, curRun = 0;
  let fullKana = 0, halfKana = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) { neutral++; curRun = 0; continue; }
    if (cp >= 0x3040 && cp <= 0x30FF) { hasKana = true; fullKana++; curRun = 0; continue; }
    if (cp >= 0x4E00 && cp <= 0x9FFF) {
      hasKanji = true; totalHanzi++;
      if (COMMON_HANZI.has(ch)) commonHanzi++;
      curRun++;
      if (curRun > maxHanziRun) maxHanziRun = curRun;
      continue;
    }
    if (cp >= 0xFF00 && cp <= 0xFFEF) {
      if (cp >= 0xFF65 && cp <= 0xFF9F) { halfKana++; hasKana = true; }
      else neutral++;
      curRun = 0; continue;
    }
    if (cp >= 0x3000 && cp <= 0x303F) { hasPunct = true; neutral++; curRun = 0; continue; }
    if (cp >= 0x2000 && cp <= 0x206F) { hasPunct = true; neutral++; curRun = 0; continue; }
    if ((cp >= 0x2150 && cp <= 0x22FF) ||
        (cp >= 0x2500 && cp <= 0x25FF) ||
        (cp >= 0x2600 && cp <= 0x26FF) ||
        (cp >= 0x2B00 && cp <= 0x2BFF)) { neutral++; curRun = 0; continue; }
    other++; curRun = 0;
  }

  const languageTotal = totalHanzi + fullKana + halfKana + other;
  return { neutral, other, languageTotal, hasKana, hasKanji, hasPunct, commonHanzi, totalHanzi, maxHanziRun, fullKana, halfKana };
}

const CANDIDATE_ENCODINGS: EncodingName[] = ['shift_jis', 'gbk', 'eucjp', 'utf8'];

/**
 * 从 DB 里提取纯显示文本字符串（角色名、道具名、技能名…）+ 公共事件/敌群页命令文本。
 * 不包含素材文件名（characterName/faceName 等，文件名对编码推断无意义）；
 * 敌群/公共事件的编辑器内部标签名对玩家不可见，也排除。
 */
function collectDisplayTexts(db: Database): string[] {
  const texts: string[] = [];
  const push = (s: string | undefined | null) => {
    if (typeof s === 'string' && s.trim()) texts.push(s.trim());
  };

  for (const a of db.actors ?? []) {
    push((a as any).name);
    push((a as any).title);
  }
  for (const c of (db as any).classes ?? []) push(c.name);
  for (const sk of db.skills ?? []) push((sk as any).name);
  for (const it of db.items ?? []) push((it as any).name);
  for (const en of db.enemies ?? []) push((en as any).name);
  for (const st of db.states ?? []) push((st as any).name);
  for (const tr of db.terrains ?? []) push((tr as any).name);
  for (const at of db.attributes ?? []) push((at as any).name);
  for (const an of db.animations ?? []) push((an as any).name);
  for (const br of (db as any).battleranimations ?? []) push(br.name);
  for (const ce of db.commonevents ?? []) {
    collectCmdTexts((ce as any).eventCommands, texts);
  }
  for (const tp of db.troops ?? []) {
    for (const page of (tp as any).pages ?? []) {
      collectCmdTexts(page.eventCommands, texts);
    }
  }
  return texts;
}

/** 事件命令中含"游戏内显示文本"的命令码集合 */
const TEXT_CODES = new Set<number>([
  EventCommandCode.ShowMessage,      // 10110  显示消息
  EventCommandCode.ShowMessage2,     // 20110  显示消息（跨行文本标记）
  // 不含 ShowChoice(10140)：其文本段只是下面所有选项文本的副本
  EventCommandCode.ShowChoiceOption, // 20140  显式选择项（单个选项）
  EventCommandCode.ChangeHeroName,   // 10610  更改英雄名称
]);

/** 从扁平事件命令列表提取显示文本 */
function collectCmdTexts(cmds: Array<{ code: number; string?: string }> | undefined, texts: string[]): void {
  for (const cmd of cmds ?? []) {
    if (cmd?.string && TEXT_CODES.has(cmd.code)) texts.push(cmd.string);
  }
}

/** 从 LMU 文件结构化解码并提取事件命令中的显示文本 */
function extractMapTexts(bufs: Uint8Array[], enc: EncodingName, engine: EngineVersion): string[] {
  const t = makeTranscoder(enc);
  const texts: string[] = [];
  for (const buf of bufs) {
    try {
      const map = decodeMapUnit(buf, { engine, transcoder: t });
      for (const ev of map.events || []) {
        for (const page of ev.pages || []) {
          collectCmdTexts(page.eventCommands, texts);
        }
      }
    } catch {}
  }
  return texts;
}

/**
 * 剥离 RM2k/2k3 消息控制码，只留真正显示给玩家的字。
 * 依据 EasyRPG Player window_message.cpp / game_message.cpp。
 */
function stripMessageCodes(s: string): string {
  return s
    .replace(/\\\\/g, '')
    .replace(/\\[cCsSnNvVtT]\[[^\]]*\]/g, '')
    .replace(/\\[cC](?!\[)/g, '')
    .replace(/\$[A-Za-z]/g, '')
    .replace(/\\[$!.|^><]/g, '')
    .replace(/\\_/g, ' ');
}

/** 纯 ASCII 文本对编码判别零信息量（无高位字节），评分前剔除 */
function hasNonAscii(s: string): boolean {
  for (const ch of s) if (ch.codePointAt(0)! > 0x7F) return true;
  return false;
}

function scoreEncoding(
  ldbBuf: Uint8Array,
  engine: EngineVersion,
  enc: EncodingName,
  extraBufs: Uint8Array[] = [],
): { total: number; reasons: string[] } {
  let db: Database;
  try {
    db = decodeDatabase(ldbBuf, { engine, transcoder: makeTranscoder(enc) });
  } catch { return { total: -1, reasons: ['decode failed'] }; }

  let displayTexts = collectDisplayTexts(db);
  if (extraBufs.length > 0) {
    const extraTexts = extractMapTexts(extraBufs, enc, engine);
    if (extraTexts.length > 0) {
      displayTexts = [...displayTexts, ...extraTexts];
    }
  }
  displayTexts = displayTexts.map(stripMessageCodes).filter(hasNonAscii);
  const reasons: string[] = [];
  let total = 0;

  if (displayTexts.length > 0) {
    const allText = displayTexts.join(' ');
    const s = scoreCharStats(allText);

    if (s.languageTotal === 0) {
      reasons.push('no language chars');
    } else {
      const n = s.languageTotal;
      const hanziRatio = s.totalHanzi / n;
      const kanaRatio = (s.fullKana + s.halfKana) / n;
      const otherRatio = s.other / n;
      const commonRatio = s.totalHanzi > 0 ? s.commonHanzi / s.totalHanzi : 0;

      total -= otherRatio * 100;
      if (otherRatio > 0.1) reasons.push(`-badOther:${otherRatio.toFixed(2)}`);

      // 中文模式：汉字多 + 常用汉字比例高
      if (hanziRatio > 0.35 && commonRatio >= 0.3 && kanaRatio < 0.2) {
        total += 50;
        reasons.push(`+zhPattern hanzi:${hanziRatio.toFixed(2)} common:${commonRatio.toFixed(2)}`);
        if (s.maxHanziRun >= 5) { total += 15; reasons.push(`+zhLongRun:${s.maxHanziRun}`); }
        if (s.hasPunct) { total += 10; reasons.push('+zhPunct'); }
      }
      // 假中文：汉字多但常用汉字极少 —— 典型 GBK 错解 Shift_JIS
      else if (hanziRatio > 0.35 && commonRatio < 0.2 && kanaRatio < 0.05) {
        total -= 20;
        reasons.push(`-fakeZh hanziManyButRareCommon:${commonRatio.toFixed(2)}`);
      }

      // 日文模式：假名占显著比例，且假名 > 汉字*0.8
      if (kanaRatio > 0.2 && kanaRatio > hanziRatio * 0.8) {
        total += 50;
        reasons.push(`+jaPattern kana:${kanaRatio.toFixed(2)} hanzi:${hanziRatio.toFixed(2)}`);
        if (hanziRatio > 0.05 && hanziRatio < 0.5) { total += 15; reasons.push('+jaMixedKanji'); }
        if (s.hasPunct) { total += 10; reasons.push('+jaPunct'); }
        const halfRatio = s.fullKana + s.halfKana > 0 ? s.halfKana / (s.fullKana + s.halfKana) : 0;
        if (halfRatio > 0.6) {
          let penalty = 25;
          if (halfRatio > 0.9) penalty += 45;
          else if (halfRatio > 0.8) penalty += 20;
          total -= penalty;
          reasons.push(`-fakeJaHalfKana halfKanaRatio:${halfRatio.toFixed(2)} penalty:${penalty}`);
        } else if (s.fullKana > 0 && s.halfKana > 0 && halfRatio < 0.3) {
          total += 5;
          reasons.push('+jaFullKanaDominant');
        }
      }

      // 乱码特征：汉字和假名都不少 —— 两种语言特征重叠
      if (hanziRatio > 0.2 && kanaRatio > 0.2) {
        total -= 30;
        reasons.push('-mixedGarbage hanzi+kana both high');
      }
    }
  } else {
    reasons.push('no displayTexts');
  }

  const sample = displayTexts.slice(0, 3).map(t => `\u201c${t.slice(0, 20)}\u201d`).join(' ');
  console.log(`[ENCODE SCORE] ${enc}: ${total.toFixed(1)}  ${reasons.join(' | ')}  sample=[${sample}]`);
  return { total, reasons };
}

/**
 * 从 RPG_RT.ini 的 [EasyRPG] 段读取显式编码声明（EasyRPG 扩展）。
 * 段名/键名/编码标识符都是 ASCII，用 latin1 解码即可读取。
 * 返回 null 表示无声明或声明不识别（"auto"/空 → 走自动检测）。
 */
export function readEncodingFromIni(iniBuf: Uint8Array | null): EncodingName | null {
  if (!iniBuf) return null;
  const text = iconv.decode(iniBuf, 'latin1').replace(/^\uFEFF/, '');
  let inEasyRpg = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      inEasyRpg = sec[1].trim().toLowerCase() === 'easyrpg';
      continue;
    }
    if (!inEasyRpg) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    if (line.slice(0, eq).trim().toLowerCase() !== 'encoding') continue;
    const val = line.slice(eq + 1).trim().toLowerCase();
    if (!val || val === 'auto') return null;
    if (val.includes('utf')) return 'utf8';
    if (val.includes('932') || val.includes('sjis') || val.includes('shift')) return 'shift_jis';
    if (val.includes('gb') || val.includes('936')) return 'gbk';
    if (val.includes('euc')) return 'eucjp';
    return null;
  }
  return null;
}

/** 纯编码推断：用 DB + 可选 .lmu 文本对候选编码评分，取最高分。 */
export function detectEncoding(
  ldbBuf: Uint8Array | null,
  engine: EngineVersion = '2k',
  extraBufs: Uint8Array[] = [],
): EncodingName {
  if (!ldbBuf) return 'latin1';

  let bestEnc: EncodingName = 'latin1';
  let bestScore = -Infinity;
  let anyPositive = false;
  for (const enc of CANDIDATE_ENCODINGS) {
    const r = scoreEncoding(ldbBuf, engine, enc, extraBufs);
    if (r.total > bestScore) { bestScore = r.total; bestEnc = enc; }
    if (r.total > 0) anyPositive = true;
  }

  if (!anyPositive) return 'latin1';
  console.log(`[ENCODE BEST] ${bestEnc} score=${bestScore.toFixed(1)}`);
  return bestEnc;
}

export type { MapUnit };