// 我的成绩：读取三个查分书签同步到 otoge-history 的历史记录（经由 otoge-sync 只读），算出每个谱面的最佳成绩
// 历史记录的格式见 chuni-b50 / maimai-dx-score / ongeki-score-export 的「历史记录」一节：
//   obs = 观测记录（src 'b' 成绩扫描 / 'p' プレイ履歴），每条有曲名 n、难度 d、分数（中二 / 音击 s，maimai a = 达成率×10000）和灯
(function () {
  const SYNC_URL = 'https://otoge-sync.131a562-index01.workers.dev';
  const SITE_ORIGIN = 'https://131a562.github.io'; // 同步服务允许读取的网站
  const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

  // 同步名字的统一写法（cleanAccount / legacyAccount）和读取 otoge-sync 用 SBGA DASHBOARD 的 src/common.js：
  // 三个书签、面板和这里共用一份（同一个网站），第一次读成绩时加载
  const COMMON_URL = SITE_ORIGIN + '/sbga-dashboard/src/common.js';
  let common = null;
  const loadCommon = () => common || (common = import(COMMON_URL).catch(() => {
    common = null; // 下次再试
    throw new Error('读不到 SBGA DASHBOARD 的 common.js（同步名字的写法和读取方法在那里）');
  }));

  // 本地测试可以用 ?sync=http://localhost:xxxx 指到模拟服务（只接受 localhost，避免被别人的链接指到别的地方）
  function syncUrl() {
    const q = new URLSearchParams(location.search).get('sync');
    return q && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q) ? q.replace(/\/+$/, '') : SYNC_URL;
  }

  async function fetchHist(game, name) {
    const { cleanAccount, legacyAccount, fetchHist: read } = await loadCommon();
    const url = syncUrl();
    const tryName = async (n) => {
      try { return (await read(url, game, n)).hist || null; } catch (e) {
        // 同步服务只允许网站（131a562.github.io）读取：本地文件、本地预览会被浏览器拦下，看起来就像连不上
        if (e.message === '连不上同步服务' && url === SYNC_URL && location.origin !== SITE_ORIGIN) {
          throw new Error(`本地打开时读不到成绩：同步服务只允许网站 ${SITE_ORIGIN} 读取，请用网址打开`);
        }
        throw e;
      }
    };
    const a = cleanAccount(name);
    let h = await tryName(a);
    if (!h && game === 'chunithm' && legacyAccount(name) !== a) h = await tryName(legacyAccount(name));
    if (!h) throw new Error(`找不到「${a}」的记录（同步名字对吗？）`);
    return h;
  }

  // 各游戏：记录里的难度 → 我们的难度；分数取法；灯的高低顺序
  const GAME = {
    chunithm: {
      diff: (o) => ['basic', 'advanced', 'expert', 'master', 'ultima'][o.d],
      score: (o) => o.s,
      lamps: ['FC', 'AJ', 'AJC'],
      lamp: (o) => o.l,
    },
    maimai: {
      diff: (o) => ({ BASIC: 'basic', ADVANCED: 'advanced', EXPERT: 'expert', MASTER: 'master', 'Re:MASTER': 'remaster' })[o.d],
      score: (o) => o.a,
      lamps: ['FC', 'FC+', 'AP', 'AP+'],
      lamp: (o) => o.fc,
    },
    ongeki: {
      diff: (o) => ({ BASIC: 'basic', ADVANCED: 'advanced', EXPERT: 'expert', MASTER: 'master', LUNATIC: 'lunatic' })[o.d],
      score: (o) => o.s,
      lamps: ['FC', 'AB', 'AB+'],
      lamp: (o) => o.l,
    },
  };

  // 历史记录 → Map(「条目 id|难度」→ 最佳成绩)。songs = 网页的曲目数据（data/<游戏>.js 的 songs）
  function build(game, hist, songs) {
    const G = GAME[game];
    // 曲名 → 条目（maimai 再分 DX / 标准；音击的 LUNATIC 可能在原曲里（Re:MASTER / LUNATIC 难度）或单独的 LUNATIC 条目）
    const byTitle = new Map();
    for (const s of songs) {
      const k = norm(s.title);
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push(s);
    }
    const best = new Map();
    let total = 0, matched = 0;
    const unmatched = new Set();
    for (const o of hist.obs || []) {
      const v = G.score(o);
      if (v == null || v < 0) continue;
      const d = G.diff(o);
      if (!d) continue;
      total++;
      const target = locate(game, o, d, byTitle.get(norm(o.n)) || []);
      if (!target) { unmatched.add(`${o.n}（${o.d}${o.kd ? ' ' + o.kd : ''}）`); continue; }
      matched++;
      const key = target.s.id + '|' + target.c.d;
      const b = best.get(key) || { score: -1, lamp: '', n: 0 };
      b.n++;
      // o：记录里的写法（曲名、难度、键），链接到查分面板的谱面记录时用
      if (v > b.score) { b.score = v; b.o = { n: o.n, d: o.d, kd: o.kd, k: o.k }; }
      const l = G.lamp(o);
      if (l && G.lamps.indexOf(l) > G.lamps.indexOf(b.lamp)) b.lamp = l;
      if (game === 'maimai') {
        if (o.x > (b.dx || 0)) b.dx = o.x;
        if (o.xm) b.dxMax = o.xm;
        if (o.sy && (!b.sync || syncRank(o.sy) > syncRank(b.sync))) b.sync = o.sy;
      }
      if (game === 'ongeki') {
        if (o.fb) b.fb = true;
        if (o.ps > (b.ps || 0)) b.ps = o.ps;
        if (o.pm) b.pm = o.pm;
        if (o.st > (b.st || 0)) b.st = o.st;
      }
      if (!b.t || o.t > b.t) b.t = o.t;
      best.set(key, b);
    }
    const last = (hist.obs || []).map((o) => o.t).sort().pop() || '';
    return { best, total, matched, unmatched: [...unmatched], charts: best.size, last, player: hist.name || '' };
  }
  // 一条记录（{ n 曲名, d 难度, kd, k }，写法同历史记录）→ { s 条目, c 谱面 }；查分面板跳过来时用
  function find(game, o, songs) {
    const d = GAME[game].diff(o);
    if (!d) return null;
    const t = norm(o.n);
    return locate(game, o, d, songs.filter((s) => norm(s.title) === t));
  }
  const SYNC_ORDER = ['SYNC', 'FS', 'FS+', 'FDX', 'FDX+'];
  const syncRank = (x) => SYNC_ORDER.indexOf(x);

  // 一条记录对应到哪个条目的哪个谱面
  function locate(game, o, d, cands) {
    if (!cands.length) return null;
    // 同名曲里，现在还能玩的（任一服务器有收录）排在已删除的前面
    const live = (s) => Object.values(s.regions || {}).some(Boolean);
    const pick = (list) => {
      for (const s of [...list].sort((a, b) => live(b) - live(a))) {
        const c = s.charts.find((x) => x.d === d);
        if (c) return { s, c };
      }
      return null;
    };
    if (game === 'maimai') {
      const kd = o.kd === 'DX' ? 'dx' : o.kd === 'STD' ? 'std' : null;
      if (kd) return pick(cands.filter((s) => s.type === kd));
      // プレイ履歴里没认出 DX / 标准：只有一种有这个难度时归到它
      const both = cands.filter((s) => (s.type === 'dx' || s.type === 'std') && s.charts.some((c) => c.d === d));
      return both.length === 1 ? pick(both) : null;
    }
    if (game === 'chunithm') return pick(cands.filter((s) => s.type === 'std'));
    // 音击：k 是「曲名|难度」，同名曲是「曲名|难度|艺术家」，分不出版本的是「…|?」（不算）
    const extra = String(o.k || '').split('|')[2];
    if (extra === '?') return null;
    let list = extra ? cands.filter((s) => norm(s.artist).includes(norm(extra)) || norm(extra).includes(norm(s.artist))) : cands;
    if (!list.length) list = cands;
    if (d !== 'lunatic') return pick(list.filter((s) => s.type === 'std'));
    // 游戏里 Re:MASTER 也显示在 LUNATIC 难度上：原曲的 Re:MASTER / LUNATIC 优先，其次是单独的 LUNATIC 条目（等级 0 的排最后）
    const opts = [];
    for (const s of list) for (const c of s.charts) if (c.d === 'remaster' || c.d === 'lunatic') opts.push({ s, c });
    opts.sort((a, b) => (a.s.type === 'std' ? 0 : 1) - (b.s.type === 'std' ? 0 : 1) || (a.c.lv === '0') - (b.c.lv === '0'));
    return opts[0] || null;
  }

  // 评级（从高到低）
  const RANKS = {
    maimai: [['SSS+', 1005000], ['SSS', 1000000], ['SS+', 995000], ['SS', 990000], ['S+', 980000], ['S', 970000], ['AAA', 940000], ['AA', 900000], ['A', 800000]],
    chunithm: [['SSS+', 1009000], ['SSS', 1007500], ['SS+', 1005000], ['SS', 1000000], ['S+', 990000], ['S', 975000], ['AAA', 950000], ['AA', 925000], ['A', 900000]],
    ongeki: [['SSS+', 1007500], ['SSS', 1000000], ['SS', 990000], ['S', 970000], ['AAA', 940000], ['AA', 900000], ['A', 850000]],
  };
  const rank = (game, v) => (RANKS[game].find(([, t]) => v >= t) || ['—'])[0];
  // 下一个评级和还差多少（已经是最高评级时 null）
  function next(game, v) {
    const r = RANKS[game];
    for (let i = r.length - 1; i >= 0; i--) if (v < r[i][1]) return { name: r[i][0], gap: r[i][1] - v };
    return null;
  }
  const fmt = (game, v) => (game === 'maimai' ? (v / 10000).toFixed(4) + '%' : v.toLocaleString('en-US'));
  const fmtGap = (game, g) => (game === 'maimai' ? (g / 10000).toFixed(4) + '%' : g.toLocaleString('en-US'));
  // 各游戏的灯（从低到高，筛选「灯」用）
  const LAMPS = Object.fromEntries(Object.entries(GAME).map(([g, x]) => [g, x.lamps]));

  window.Scores = { fetchHist, build, find, rank, next, fmt, fmtGap, RANKS, LAMPS };
})();
