// 下载并整理三个游戏的曲目数据 → songs/data/{maimai,chunithm,ongeki}.js
//   node scripts/build-data.mjs            从网上下载最新数据
//   node scripts/build-data.mjs <目录>     用目录里已下载的 z_<游戏>.json / <游戏>.json / lx_<游戏>.json（离线调试用）
//
// 主数据：arcade-songs-db（zetaraku）— 曲目列表、每个谱面的版本、定数（日服，maimai 另有国际服不同的值）、谱师、物量
// 补充：otoge-db（zvuc）— 宴谱 / WORLD'S END / LUNATIC 的物量和谱师、各种类物量、wiki 链接、音击角色
// 国服：落雪查分器（LXNS）— maimai / 中二的国服收录、国服定数、国服版本（和水鱼查分器的定数一致）
// 音击参考定数：Tachi 的谱面库 — 现行定数还没测出来的谱面，用 Re:Fresh 初期的值作参考（只在等级和现在一样时采用）；
//   LUNATIC 里哪些是原曲的 Re:MASTER 也按 Tachi 的分类
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const outDir = fileURLToPath(new URL('../data/', import.meta.url));
const localDir = process.argv[2];
const GAMES = ['maimai', 'chunithm', 'ongeki'];

async function load(game, source) {
  if (localDir) return JSON.parse(await readFile(join(localDir, source === 'o' ? `${game}.json` : `${source}_${game}.json`), 'utf8'));
  const url = {
    z: `https://dp4p6x0xfi5o9.cloudfront.net/${game}/data.json`,
    o: `https://otoge-db.net/${game}/data/music-ex.json`,
    lx: `https://maimai.lxns.net/api/v0/${game}/song/list?notes=true`,
    tc: `https://raw.githubusercontent.com/zkldi/Tachi/main/db/seeds/charts-${game}.json`,
    ts: `https://raw.githubusercontent.com/zkldi/Tachi/main/db/seeds/songs-${game}.json`,
  }[source];
  // 国内的服务器从海外连有时会超时，多试几次
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= 4) throw new Error(`${url}: ${e.cause?.code || e.message}`);
      console.warn(`${url} 下载失败（${e.cause?.code || e.message}），重试 ${i}/3`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, '');
const stripUtage = (t) => t.replace(/^\[.+?\]/, '');
const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
const str = (v) => (v == null || v === '' || v === '-' ? null : String(v));
const ymd = (s) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null);

// otoge-db 的谱面字段 → { ds, notes:{...}, des }
function odbChart(o, prefix, kinds) {
  if (!o) return null;
  const notes = { total: num(o[`${prefix}_notes`]) };
  for (const k of kinds) notes[k] = num(o[`${prefix}_notes_${k}`]);
  return { ds: num(o[`${prefix}_i`]), notes, des: str(o[`${prefix}_designer`]), link: str(o[`${prefix}_chart_link`]) };
}

// 用 otoge-db 补全 zetaraku 谱面缺的数据
function mergeChart(sheet, extra) {
  const notes = {};
  const zn = sheet.noteCounts || {};
  const en = extra?.notes || {};
  for (const k of new Set([...Object.keys(zn), ...Object.keys(en)])) notes[k] = zn[k] ?? en[k] ?? null;
  const ds = sheet.internalLevel != null ? +sheet.internalLevel : extra?.ds ?? null;
  return {
    d: sheet.difficulty,
    lv: sheet.level,
    ds,
    des: str(sheet.noteDesigner) ?? extra?.des ?? null,
    notes,
    ver: sheet.version || undefined,
    intl: intlOverride(sheet.regionOverrides?.intl),
    link: extra?.link || undefined, // sdvx.in 的谱面确认页（中二 / 音击）
  };
}

// 国际服和日服不同的等级 / 定数 / 版本（只有 maimai 有）。ds 为 null = 等级不同、定数未知
function intlOverride(ov) {
  if (!ov || !Object.keys(ov).length) return undefined;
  const r = {};
  if (ov.level != null) r.lv = ov.level;
  if (ov.internalLevel != null) r.ds = +ov.internalLevel;
  else if (ov.level != null) r.ds = null;
  if (ov.version) r.ver = ov.version;
  return Object.keys(r).length ? r : undefined;
}

// 按「曲名+艺术家」、再按「曲名」唯一匹配
function indexer(list, keyFn = (o) => o.title) {
  const byTA = new Map(), byT = new Map();
  for (const o of list) {
    const t = norm(keyFn(o));
    byTA.set(t + '\u0000' + norm(o.artist), o);
    byT.set(t, byT.has(t) ? false : o);
  }
  return (title, artist) => byTA.get(norm(title) + '\u0000' + norm(artist)) || byT.get(norm(title)) || null;
}

const regionsOf = (sheets) => {
  const r = {};
  for (const s of sheets) for (const [k, v] of Object.entries(s.regions || {})) r[k] = r[k] || v;
  return r;
};

function baseEntry(game, z, song, extra) {
  return {
    id: song.songId,
    title: song.title,
    artist: song.artist,
    cat: song.category,
    ver: song.version,
    bpm: song.bpm ?? num(extra?.bpm),
    date: song.releaseDate,
    img: song.imageName,
    reading: extra?.title_kana || extra?.reading || extra?.title_sort || undefined,
    wiki: extra?.wiki_url || extra?.wikiwiki_url || undefined,
    comment: song.comment || undefined,
    isNew: song.isNew || undefined,
  };
}

const stats = {};

function buildMaimai(z, odb) {
  const normal = odb.filter((o) => !o.lev_utage);
  const utage = odb.filter((o) => o.lev_utage);
  const findN = indexer(normal);
  const findU = indexer(utage, (o) => stripUtage(o.title) + '|' + (o.kanji || ''));
  const K = ['tap', 'hold', 'slide', 'touch', 'break'];
  const out = [];
  let miss = 0;
  for (const song of z.songs) {
    const types = [...new Set(song.sheets.map((s) => s.type))];
    for (const type of types) {
      const sheets = song.sheets.filter((s) => s.type === type);
      if (type === 'utage') {
        const kanji = sheets[0].difficulty.replace(/[【】]/g, '');
        const o = findU(stripUtage(song.title) + '|' + kanji, song.artist);
        if (!o) miss++;
        const e = baseEntry('maimai', z, song, o);
        e.title = stripUtage(song.title); // 曲名前的 [宴] 等单独存在 kanji 里
        e.type = 'utage';
        e.kanji = kanji;
        e.comment = song.comment || str(o?.comment) || undefined;
        e.buddy = o?.buddy ? true : undefined;
        const lvl = str(o?.lev_utage) ?? sheets[0].level;
        const chart = mergeChart({ ...sheets[0], level: lvl }, o ? odbChart(o, 'lev_utage', K) : null);
        chart.d = 'utage';
        chart.des = null; // otoge-db 的宴谱「谱师」栏填的是说明文字，和 comment 重复
        if (o?.buddy) {
          chart.left = odbChart(o, 'lev_utage_left', K).notes;
          chart.right = odbChart(o, 'lev_utage_right', K).notes;
          chart.notes = Object.fromEntries(['total', ...K].map((k) => [k, (chart.left[k] ?? 0) + (chart.right[k] ?? 0)]));
        }
        e.charts = [chart];
        e.regions = regionsOf(sheets);
        out.push(e);
        continue;
      }
      const o = findN(song.title, song.artist);
      if (!o) miss++;
      const e = baseEntry('maimai', z, song, o);
      e.id = `${song.songId}|${type}`;
      e.type = type;
      e.ver = sheets[0].version || song.version; // DX 谱和标准谱各有自己的版本
      const pre = type === 'dx' ? 'dx_lev_' : 'lev_';
      const map = { basic: 'bas', advanced: 'adv', expert: 'exp', master: 'mas', remaster: 'remas' };
      e.charts = sheets.map((s) => mergeChart(s, odbChart(o, pre + map[s.difficulty], K)));
      e.verIntl = e.charts.find((c) => c.intl?.ver)?.intl.ver;
      e.regions = regionsOf(sheets);
      out.push(e);
    }
  }
  stats.maimai = { entries: out.length, unmatched: miss };
  return out;
}

function buildChunithm(z, odb) {
  const normal = odb.filter((o) => !o.we_kanji);
  const we = odb.filter((o) => o.we_kanji);
  const findN = indexer(normal);
  const findW = indexer(we, (o) => o.title + '|' + o.we_kanji);
  const K = ['tap', 'hold', 'slide', 'air', 'flick'];
  const out = [];
  let miss = 0;
  for (const song of z.songs) {
    const type = song.sheets[0].type;
    if (type === 'we') {
      const kanji = song.sheets[0].difficulty.replace(/[【】]/g, '');
      const o = findW(song.title + '|' + kanji, song.artist);
      if (!o) miss++;
      const e = baseEntry('chunithm', z, song, o);
      e.type = 'we';
      e.kanji = kanji;
      e.star = num(o?.we_star) ?? (song.sheets[0].levelValue > 100 ? song.sheets[0].levelValue - 100 : null);
      const chart = mergeChart(song.sheets[0], odbChart(o, 'lev_we', K));
      chart.d = 'worldsend';
      chart.lv = `${kanji}${'☆'.repeat(e.star || 0)}`;
      e.charts = [chart];
      e.regions = regionsOf(song.sheets);
      out.push(e);
      continue;
    }
    const o = findN(song.title, song.artist);
    if (!o) miss++;
    const e = baseEntry('chunithm', z, song, o);
    e.type = 'std';
    const map = { basic: 'bas', advanced: 'adv', expert: 'exp', master: 'mas', ultima: 'ult' };
    e.charts = song.sheets.map((s) => mergeChart(s, odbChart(o, 'lev_' + map[s.difficulty], K)));
    e.regions = regionsOf(song.sheets);
    out.push(e);
  }
  stats.chunithm = { entries: out.length, unmatched: miss };
  return out;
}

function buildOngeki(z, odb) {
  const find = indexer(odb);
  // 同一首歌可能有几张 LUNATIC（Perfect Shining!! 的 Re:MASTER 和ロケテスト LUNATIC），按等级挑对应的那条
  const lunOf = new Map();
  for (const o of odb.filter((o) => o.lev_lnt)) {
    const k = norm(o.title) + ' ' + norm(o.artist);
    if (!lunOf.has(k)) lunOf.set(k, []);
    lunOf.get(k).push(o);
  }
  const findL = (title, artist, level) => {
    const list = lunOf.get(norm(title) + ' ' + norm(artist)) || [];
    return list.find((o) => o.lev_lnt === level) || list[0] || null;
  };
  const out = [];
  let miss = 0;
  const oChart = (o, p) => {
    if (!o) return null;
    return {
      ds: num(o[`lev_${p}_i`]),
      des: str(o[`lev_${p}_designer`]),
      notes: { total: num(o[`lev_${p}_notes`]), bell: num(o[`lev_${p}_bells`]) },
      link: str(o[`lev_${p}_chart_link`]),
    };
  };
  for (const song of z.songs) {
    const type = song.sheets[0].type;
    const o = type === 'lun' ? findL(song.title, song.artist, song.sheets[0].level) : find(song.title, song.artist);
    if (!o) miss++;
    const e = baseEntry('ongeki', z, song, o);
    e.type = type;
    if (o) {
      e.chara = str(o.character) || undefined;
      e.element = str(o.enemy_type) || undefined;
      e.enemyLv = num(o.enemy_lv) ?? undefined;
      e.bonus = o.bonus === '1' || undefined;
      e.chapter = str(o.chapter) || undefined;
    }
    const map = { basic: 'bas', advanced: 'adv', expert: 'exc', master: 'mas', lunatic: 'lnt' };
    e.charts = song.sheets.map((s) => mergeChart(s, oChart(o, map[s.difficulty])));
    e.regions = regionsOf(song.sheets);
    out.push(e);
  }
  stats.ongeki = { entries: out.length, unmatched: miss };
  return out;
}

// ---- 国服（LXNS）----
const LX_DIFFS = {
  maimai: ['basic', 'advanced', 'expert', 'master', 'remaster'],
  chunithm: ['basic', 'advanced', 'expert', 'master', 'ultima', 'worldsend'],
};
function applyCn(game, entries, lx) {
  const vers = [...lx.versions].sort((a, b) => a.version - b.version);
  const verName = (n) => {
    let name = null;
    for (const v of vers) if (v.version <= n) name = v.title;
    return name;
  };
  const special = (e) => e.type === 'utage' || e.type === 'we';
  const keyOf = (e) => (special(e) ? `${e.title}|${e.kanji}` : e.title);
  const finders = {};
  for (const e of entries) e.regions.cn = false; // 国服收录以 LXNS 为准
  const finder = (type) => (finders[type] ||= indexer(entries.filter((e) => e.type === type), (e) => keyOf(e)));
  const genres = new Map((lx.genres || []).map((g) => [g.genre, g.genre]));
  let matched = 0, added = 0, diff = 0, cnDs = 0;
  const filled = { des: 0, notes: 0 };
  // LXNS 一首歌 → [我们的种类, 谱面列表]
  const groups = (song) => {
    if (game === 'maimai') {
      return [['std', song.difficulties.standard], ['dx', song.difficulties.dx], ['utage', song.difficulties.utage]].filter(([, l]) => l?.length);
    }
    const we = song.difficulties.filter((d) => d.difficulty === 5);
    const std = song.difficulties.filter((d) => d.difficulty !== 5);
    return [['std', std], ['we', we]].filter(([, l]) => l.length);
  };
  for (const song of lx.songs) {
    for (const [type, charts] of groups(song)) {
      const kanji = charts[0].kanji;
      const title = type === 'utage' ? stripUtage(song.title) : song.title;
      let e = finder(type)(special({ type }) ? `${title}|${kanji}` : title, song.artist);
      if (e) matched++;
      else {
        // 国服独有（或日服数据里没有）的条目
        added++;
        e = {
          id: `cn:${song.id}|${type}`,
          title,
          artist: song.artist,
          cat: song.genre,
          bpm: song.bpm || null,
          img: null,
          imgUrl: `https://assets2.lxns.net/${game}/jacket/${song.id}.png`,
          type,
          kanji: kanji || undefined,
          star: charts[0].star || undefined,
          comment: charts[0].description || undefined,
          buddy: charts[0].is_buddy || undefined,
          charts: [],
          regions: {},
        };
        entries.push(e);
      }
      e.regions.cn = true;
      e.verCn = verName(Math.min(...charts.map((c) => c.version || song.version)));
      for (const c of charts) {
        const d = type === 'utage' ? 'utage' : LX_DIFFS[game][c.difficulty];
        let ch = e.charts.find((x) => x.d === d);
        if (!ch) {
          const n = c.notes || {};
          ch = { d, lv: null, ds: null, des: str(c.note_designer), notes: n.left ? sumNotes(n.left, n.right) : { ...n } };
          if (n.left) { ch.left = n.left; ch.right = n.right; }
          if (d === 'worldsend') ch.lv = `${kanji}${'☆'.repeat(c.star || 0)}`;
          e.charts.push(ch);
        } else {
          // 日服数据源缺的谱师 / 物量用落雪的补（主要是 WORLD'S END）
          if (!ch.des && str(c.note_designer) && d !== 'utage') { ch.des = str(c.note_designer); filled.des++; }
          const n = c.notes || {};
          if (!ch.notes?.total && n.total) { ch.notes = { ...n }; filled.notes++; }
        }
        const ds = c.level_value || null;
        ch.cn = { lv: c.level, ds, ver: verName(c.version || song.version) };
        if (ds != null) cnDs++;
        if (ds != null && ch.ds != null && Math.abs(ds - ch.ds) > 1e-6) diff++;
      }
      const order = LX_DIFFS[game].concat('utage');
      e.charts.sort((a, b) => order.indexOf(a.d) - order.indexOf(b.d));
    }
  }
  return { matched, added, cnDsCharts: cnDs, dsDiffFromJp: diff, filled, versions: vers.map((v) => ({ name: v.title, version: v.version })) };
}
const sumNotes = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, (a[k] ?? 0) + (b[k] ?? 0)]));

// 音击：现行定数未知的谱面，用 Tachi 记录的 Re:Fresh 初期定数作参考。
// Re:Fresh Act.2 又改过一次定数，Tachi 的值有一部分已经过时，所以只在 Tachi 的等级和现在的等级相同时采用，并单独存成 dsRef
function applyOngekiRef(entries, tc, ts) {
  const songs = indexer(ts);
  const charts = new Map();
  for (const c of tc) if (c.isPrimary !== false) charts.set(`${c.songID}|${c.difficulty}`, c);
  let used = 0, skipped = 0;
  for (const e of entries) {
    const t = songs(e.title, e.artist);
    if (!t) continue;
    for (const ch of e.charts) {
      if (ch.ds != null) continue;
      const c = charts.get(`${t.id}|${ch.d.toUpperCase()}`);
      const r = c?.data.levelHistory?.refresh ?? c?.data.levelHistory?.refreshOmni;
      if (!r || !r.levelNum) continue;
      if (r.level === ch.lv) { ch.dsRef = r.levelNum; used++; } else skipped++;
    }
  }
  return { used, skippedLevelChanged: skipped };
}

// 音击：LUNATIC 条目合并回原曲（作为原曲的一个难度）：
//   - 原曲的 Re:MASTER → 原曲的 Re:MASTER 难度。哪个是 Re:MASTER 按 Tachi 的分类（和 wikiwiki 的 Re:MASTER 一览一致）
//   - 其余 LUNATIC：等级不是 0、并且有同曲名同艺术家的通常曲（有其他难度的常规谱面）→ 原曲的 LUNATIC 难度
//   - 等级为 0 的（ロケテスト谱面等）和没有通常曲的 LUNATIC 仍是单独的条目
// 同一首歌 Re:MASTER 和 LUNATIC 都有时（Perfect Shining!! 等）按等级、再按物量区分是哪一张
function mergeOngekiLunatic(entries, tc, ts) {
  const songs = indexer(ts);
  const bySong = new Map();
  for (const c of tc) {
    if (c.difficulty !== 'Re:MASTER' && c.difficulty !== 'LUNATIC') continue;
    if (!bySong.has(c.songID)) bySong.set(c.songID, []);
    bySong.get(c.songID).push(c);
  }
  const lvOf = (c) => (c.data.levelHistory?.refreshOmni ?? c.data.levelHistory?.refresh)?.level ?? c.level;
  const stdList = entries.filter((e) => e.type === 'std');
  const std = indexer(stdList);
  // LUNATIC 只和曲名、艺术家都一样的通常曲合并（同名不同编曲的不算）
  const stdExact = new Map(stdList.map((e) => [norm(e.title) + ' ' + norm(e.artist), e]));
  let remaster = 0, lunatic = 0, keptLevel0 = 0, keptNoParent = 0;
  for (const e of entries) {
    if (e.type !== 'lun') continue;
    const t = songs(e.title, e.artist);
    const cands = t ? bySong.get(t.id) || [] : [];
    const ch = e.charts[0];
    const hit = cands.length === 1 ? cands[0] : cands.find((c) => lvOf(c) === ch.lv) || cands.find((c) => ch.notes.total && c.data.maxPlatScore === ch.notes.total * 2);
    const gone = Object.values(e.regions).some(Boolean) ? undefined : true;
    if (hit?.difficulty === 'Re:MASTER') {
      const parent = std(e.title, e.artist);
      if (!parent) { keptNoParent++; continue; }
      parent.charts.push({ ...ch, d: 'remaster', ver: e.ver, gone });
      remaster++;
    } else {
      if (!ch.lv || ch.lv === '0') { keptLevel0++; continue; }
      const parent = stdExact.get(norm(e.title) + ' ' + norm(e.artist));
      if (!parent || parent.charts.some((c) => c.d === 'lunatic')) { keptNoParent++; continue; }
      parent.charts.push({ ...ch, d: 'lunatic', ver: e.ver, gone });
      lunatic++;
    }
    e._merged = true;
  }
  entries.splice(0, entries.length, ...entries.filter((e) => !e._merged));
  return { remaster, lunatic, keptLevel0, keptNoParent };
}

const builders = { maimai: buildMaimai, chunithm: buildChunithm, ongeki: buildOngeki };

await mkdir(outDir, { recursive: true });
const generated = new Date().toISOString();
for (const game of GAMES) {
  const [z, odb, lx] = await Promise.all([load(game, 'z'), load(game, 'o'), LX_DIFFS[game] ? load(game, 'lx') : null]);
  const songs = builders[game](z, odb);
  let cn = null;
  if (lx) {
    cn = applyCn(game, songs, lx);
    stats[game].cn = { matched: cn.matched, added: cn.added, cnDsCharts: cn.cnDsCharts, dsDiffFromJp: cn.dsDiffFromJp, filledFromLxns: cn.filled };
  }
  if (game === 'ongeki') {
    const [tc, ts] = await Promise.all([load(game, 'tc'), load(game, 'ts')]);
    stats[game].ref = applyOngekiRef(songs, tc, ts);
    stats[game].lunatic = mergeOngekiLunatic(songs, tc, ts);
  }
  const data = {
    game,
    generated,
    sourceTime: z.updateTime,
    versions: z.versions.map((v) => ({ name: v.version, abbr: v.abbr, date: v.releaseDate })),
    versionsCn: cn?.versions.map((v) => v.name).filter((v, i, a) => a.indexOf(v) === i),
    categories: [...new Set([...z.categories.map((c) => c.category), ...songs.map((s) => s.cat)])],
    songs,
  };
  // 写成 <script> 能直接加载的 JS，这样双击 index.html（file://）也能用
  const js = `window.SONG_DATA = window.SONG_DATA || {};\nwindow.SONG_DATA[${JSON.stringify(game)}] = ${JSON.stringify(data)};\n`;
  await writeFile(join(outDir, `${game}.js`), js);
  console.log(game, stats[game], `${(js.length / 1024 / 1024).toFixed(2)} MB`);
}
