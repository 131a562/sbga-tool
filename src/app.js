// SBGA TOOL：列表筛选 + 曲目卡片页
(function () {
  const GAMES = {
    maimai: {
      name: 'maimai DX',
      types: [['std', '标准'], ['dx', 'DX'], ['utage', '宴']],
      diffs: { basic: 'BASIC', advanced: 'ADVANCED', expert: 'EXPERT', master: 'MASTER', remaster: 'Re:MASTER', utage: '宴' },
      short: { basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM', utage: '宴' },
      high: ['expert', 'master', 'remaster', 'utage'],
      regions: [['jp', '日服'], ['intl', '国际服'], ['cn', '国服']],
      kinds: [['tap', 'TAP'], ['hold', 'HOLD'], ['slide', 'SLIDE'], ['touch', 'TOUCH'], ['break', 'BREAK']],
    },
    chunithm: {
      name: 'CHUNITHM',
      types: [['std', '通常'], ['we', "WORLD'S END"]],
      diffs: { basic: 'BASIC', advanced: 'ADVANCED', expert: 'EXPERT', master: 'MASTER', ultima: 'ULTIMA', worldsend: "WORLD'S END" },
      short: { basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', ultima: 'ULT', worldsend: 'WE' },
      high: ['expert', 'master', 'ultima', 'worldsend'],
      regions: [['jp', '日服'], ['intl', '国际服'], ['cn', '国服']],
      kinds: [['tap', 'TAP'], ['hold', 'HOLD'], ['slide', 'SLIDE'], ['air', 'AIR'], ['flick', 'FLICK']],
    },
    ongeki: {
      name: 'オンゲキ',
      types: [['std', '通常'], ['lun', 'LUNATIC']],
      diffs: { basic: 'BASIC', advanced: 'ADVANCED', expert: 'EXPERT', master: 'MASTER', remaster: 'Re:MASTER', lunatic: 'LUNATIC' },
      short: { basic: 'BAS', advanced: 'ADV', expert: 'EXP', master: 'MAS', remaster: 'ReM', lunatic: 'LUN' },
      high: ['expert', 'master', 'remaster', 'lunatic'],
      regions: [['jp', '日服']],
      kinds: [['bell', 'BELL']],
    },
  };
  const PAGE = 120;
  const FILTER_VERSION = 2; // 难度选项有变化时加 1（音击加了 Re:MASTER）
  const SORTS = [['default', '默认（版本新→旧）'], ['ds', '定数'], ['title', '曲名'], ['notes', '物量'], ['bpm', 'BPM'], ['date', '实装日期']];
  const cover = (s) => s.imgUrl || `https://dp4p6x0xfi5o9.cloudfront.net/${game}/img/cover/${s.img}`;
  const SERVER = { jp: '日服', intl: '国际服', cn: '国服' };
  const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#8884"/></svg>');

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (n, d = 0) => (n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---- 搜索用的统一写法：全角半角、大小写、片假名→平假名、浊音→清音、小字→大字、去掉长音、空格和符号 ----
  // （数据里的读音是「センホンサクラ」这种不带浊点、小字写成大字的写法，所以搜「せんぼんざくら」也要能对上）
  const SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'ゕ': 'か', 'ゖ': 'け' };
  function norm(s) {
    return String(s ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
      .normalize('NFD')
      .replace(/[゙゚]/g, '')
      .normalize('NFC')
      .replace(/[ぁぃぅぇぉっゃゅょゎゕゖ]/g, (c) => SMALL[c])
      .replace(/[\s\-_.,!?・~〜ー'"‘’“”()\[\]【】「」『』:;/☆★♪♡♥＊*#&+=、。…]/g, '');
  }
  // 模糊匹配：关键词按空格（半角、全角都算）拆成几段，每段都要作为连续的字出现在字段的同一个单词里——
  // 不拆开单个关键词去按顺序匹配，也不跨过字段里的空格。返回分数，0 = 不匹配；从开头就对上的排前面，越靠前、字段越短越前
  // 每个关键词是一组可选写法：原样（统一写法后）+ 罗马音时换成的假名（kuroneko → くろねこ），对上其中一个就算
  const tokensOf = (q) => String(q ?? '').trim().split(/\s+/).map((t) => {
    const alts = [norm(t)];
    const kana = romajiToKana(t);
    if (kana) alts.push(norm(kana));
    return [...new Set(alts.filter(Boolean))];
  }).filter((a) => a.length);
  const wordsOf = (str) => String(str ?? '').trim().split(/\s+/).map(norm).filter(Boolean);

  // 罗马音 → 平假名（平文式、训令式都行：shi/si、tsu/tu、fu/hu、ji/zi…）。整个关键词都能转换时才返回，否则 null。
  // 汉字靠读音匹配；数据里的读音不带浊点、小字写成大字，所以转出来的假名同样经过 norm 统一后再比较
  const ROMAJI = (() => {
    const t = {
      a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
      ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご',
      sa: 'さ', shi: 'し', si: 'し', su: 'す', se: 'せ', so: 'そ', za: 'ざ', ji: 'じ', zi: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ',
      ta: 'た', chi: 'ち', ti: 'ち', tsu: 'つ', tu: 'つ', te: 'て', to: 'と', da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
      na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の',
      ha: 'は', hi: 'ひ', fu: 'ふ', hu: 'ふ', he: 'へ', ho: 'ほ', ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ',
      pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ',
      ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', ya: 'や', yu: 'ゆ', yo: 'よ',
      ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', wa: 'わ', wo: 'を', wi: 'うぃ', we: 'うぇ',
      fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ', va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
      sha: 'しゃ', shu: 'しゅ', sho: 'しょ', she: 'しぇ', cha: 'ちゃ', chu: 'ちゅ', cho: 'ちょ', che: 'ちぇ',
      ja: 'じゃ', ju: 'じゅ', jo: 'じょ', je: 'じぇ', thi: 'てぃ', dhi: 'でぃ', twu: 'とぅ', tsa: 'つぁ',
    };
    // 拗音：kya / sya / cya / jya / zya …
    for (const [c, k] of Object.entries({ k: 'き', g: 'ぎ', s: 'し', z: 'じ', j: 'じ', t: 'ち', c: 'ち', d: 'ぢ', n: 'に', h: 'ひ', b: 'び', p: 'ぴ', m: 'み', r: 'り' })) {
      t[c + 'ya'] = k + 'ゃ'; t[c + 'yu'] = k + 'ゅ'; t[c + 'yo'] = k + 'ょ';
    }
    return t;
  })();
  function romajiToKana(q) {
    const s = String(q).normalize('NFKC').toLowerCase().replace(/[-']/g, (c) => (c === '-' ? 'ー' : "'"));
    if (!/[a-z]/.test(s) || /[^a-zー']/.test(s)) return null;
    let out = '';
    for (let i = 0; i < s.length; ) {
      const c = s[i];
      if (c === 'ー') { out += 'ー'; i++; continue; }
      if (c === "'") { i++; continue; }
      // ん：n 后面不是元音 / y，或者在末尾；nn 后面跟元音时只算一个 ん（konnichiwa → こんにちわ）
      if (c === 'n' && !/[aiueoy]/.test(s[i + 1] || '')) { out += 'ん'; i += s[i + 1] === "'" ? 2 : 1; continue; }
      // 促音：同一个辅音连写（kk、tt、tch…）
      if (c === s[i + 1] && /[bcdfghjkmpqrstvwxyz]/.test(c) || (c === 't' && s[i + 1] === 'c')) { out += 'っ'; i++; continue; }
      const hit = [3, 2, 1].map((n) => s.slice(i, i + n)).find((k) => ROMAJI[k]);
      if (!hit) return null;
      out += ROMAJI[hit];
      i += hit.length;
    }
    return out;
  }
  function fuzzy(tokens, words) {
    if (!tokens.length) return 1;
    if (!words || !words.length) return 0;
    let score = 0;
    for (const alts of tokens) {
      let best = 0;
      words.forEach((w, k) => {
        for (const t of alts) {
          const i = w.indexOf(t);
          if (i < 0) continue;
          best = Math.max(best, i === 0 ? (k === 0 ? 300 : 250) : 200 - Math.min(i, 100));
        }
      });
      if (!best) return 0;
      score += best;
    }
    return score / tokens.length - words.join('').length / 1000;
  }

  // 「正则」模式用的简化规则：_ 表示一个不是空格的字符，* 表示一个以上不是空格的字符，其他字符都按字面匹配。
  // 例：a__b = a、两个非空格字符、b；a*b = a 和 b 中间至少有一个非空格字符。不分大小写、全角半角，可以出现在曲名中间的任何位置
  function pattern(q) {
    const src = [...q.normalize('NFKC')].map((ch) => (ch === '_' ? '\\S' : ch === '*' ? '\\S+' : ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))).join('');
    return new RegExp(src, 'iu');
  }

  // ---- 状态 ----
  const data = {};
  let game = null;
  let F = null; // 当前游戏的筛选
  let results = [];
  let shown = 0;
  let listScroll = 0;

  function defaultFilter(g) {
    return { fv: FILTER_VERSION, q: '', mode: 'fuzzy', scope: 'title', vers: [], types: GAMES[g].types.map((t) => t[0]), diffs: [...GAMES[g].high], dsMin: '', dsMax: '', est: true, cat: '', chara: '', region: 'jp', sort: 'default', desc: true };
  }
  function loadFilter(g) {
    const saved = store.get('songs.filter.' + g);
    if (saved && saved.fv !== FILTER_VERSION) delete saved.diffs;
    const f = Object.assign(defaultFilter(g), saved || {});
    f.fv = FILTER_VERSION;
    f.q = ''; // 搜索词不保留
    return f;
  }
  const saveFilter = () => store.set('songs.filter.' + game, { ...F, q: '' });

  const loading = {};
  function loadData(g) {
    return (loading[g] ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `data/${g}.js`;
      s.onload = () => {
        const d = window.SONG_DATA[g];
        d._verIdx = {
          jp: new Map(d.versions.map((v, i) => [v.name, i])),
          cn: new Map((d.versionsCn || []).map((v, i) => [v, i])),
        };
        for (const song of d.songs) {
          song._nt = norm(song.title);
          song._wt = wordsOf(song.title);
          // 读音是连在一起写的，曲名里有空格时用读音会跨单词匹配，所以只在曲名没有空格时用
          song._wr = /\s/.test(song.title.trim()) ? [] : wordsOf(song.reading);
          song._wa = wordsOf(song.artist);
          song._des = [...new Set(song.charts.map((c) => c.des).filter(Boolean))];
          song._wd = song._des.flatMap(wordsOf);
          song._live = Object.values(song.regions || {}).some(Boolean);
        }
        data[g] = d;
        resolve(d);
      };
      s.onerror = () => { delete loading[g]; s.remove(); reject(new Error(`读不到 data/${g}.js，先运行 node scripts/build-data.mjs`)); };
      document.head.appendChild(s);
    }));
  }

  // ---- 服务器：等级 / 定数 / 版本按所选服务器取（「全部」用日服的，日服没有的用国服的） ----
  function viewIn(c, sv) {
    if (c.gone && sv !== 'all') return null;
    if (sv === 'cn') return c.cn ? { lv: c.cn.lv, ds: c.cn.ds } : null;
    if (sv === 'intl' && c.intl) return { lv: c.intl.lv ?? c.lv, ds: 'ds' in c.intl ? c.intl.ds : c.ds };
    if (c.lv == null) return sv === 'all' && c.cn ? { lv: c.cn.lv, ds: c.cn.ds } : null;
    return { lv: c.lv, ds: c.ds, ref: c.dsRef };
  }
  const view = (c) => viewIn(c, F.region);
  // 定数未公开时按等级估：13+ → 13.7（中二 13.5），宴谱的「13?」→ 13
  function estLv(lv) {
    const m = /^(\d+)(\+?)/.exec(lv || '');
    return m ? +m[1] + (m[2] ? (game === 'chunithm' ? 0.5 : 0.7) : 0) : null;
  }
  // 没有定数这个概念的谱面：WORLD'S END、等级为 0 的 LUNATIC（音击）
  const noConst = (c, v) => c.d === 'worldsend' || (c.d === 'lunatic' && (v?.lv ?? c.lv) === '0');
  function dsOf(c) {
    const v = view(c);
    if (!v) return null;
    if (v.ds != null) return v.ds;
    if (!F.est || noConst(c, v)) return null;
    return v.ref ?? estLv(v.lv);
  }
  function verOf(s) {
    if (F.region === 'cn') return s.verCn;
    if (F.region === 'intl') return s.verIntl ?? s.ver;
    return s.ver ?? s.verCn;
  }
  const verList = () => (F.region === 'cn' ? data[game].versionsCn : data[game].versions.map((v) => v.name));
  const verRank = (s) => data[game]._verIdx[F.region === 'cn' ? 'cn' : 'jp'].get(verOf(s)) ?? -1;

  // ---- 筛选 ----
  function filterSongs() {
    const d = data[game];
    const vers = new Set(F.vers), types = new Set(F.types), diffs = new Set(F.diffs);
    const min = F.dsMin === '' ? null : +F.dsMin, max = F.dsMax === '' ? null : +F.dsMax;
    const useDs = min != null || max != null;
    F._err = '';
    const re = F.q && F.mode === 'regex' ? pattern(F.q) : null;
    const nq = tokensOf(F.q);
    const out = [];
    for (const s of d.songs) {
      if (!types.has(s.type)) continue;
      if (vers.size && !vers.has(verOf(s))) continue;
      if (F.cat && s.cat !== F.cat) continue;
      if (F.chara && s.chara !== F.chara) continue;
      if (F.region !== 'all' && !(s.regions && s.regions[F.region])) continue;
      // 难度 / 定数：选中难度里至少有一个谱面在定数范围内
      let hit = null;
      for (const c of s.charts) {
        if (!diffs.has(c.d) || !view(c)) continue;
        if (useDs) {
          const v = dsOf(c);
          if (v == null || (min != null && v < min - 1e-9) || (max != null && v > max + 1e-9)) continue;
        }
        if (!hit || (dsOf(c) ?? 0) > (dsOf(hit) ?? 0)) hit = c;
      }
      if (!hit) continue;
      let score = 1;
      if (F.q) {
        if (F.mode === 'regex') {
          if (!re) continue;
          // 读音是连在一起写的（On your mark → ONYOURMARK…），曲名里有空格时用读音会跨单词匹配，所以只用曲名
          const fields = F.scope === 'title' ? (/\s/.test(s.title) ? [s.title] : [s.title, s.reading]) : F.scope === 'artist' ? [s.artist] : s._des;
          if (!fields.some((x) => x && re.test(x.normalize('NFKC')))) continue;
        } else {
          score = F.scope === 'title' ? Math.max(fuzzy(nq, s._wt), fuzzy(nq, s._wr) * 0.9) : F.scope === 'artist' ? fuzzy(nq, s._wa) : fuzzy(nq, s._wd);
          if (!score) continue;
        }
      }
      out.push({ s, hit, score });
    }
    const dir = F.desc ? -1 : 1;
    const by = {
      default: (a, b) => (verRank(b.s) - verRank(a.s)) || cmpStr(b.s.date, a.s.date),
      ds: (a, b) => dir * ((dsOf(a.hit) ?? -1) - (dsOf(b.hit) ?? -1)),
      title: (a, b) => dir * a.s.title.localeCompare(b.s.title, 'ja'),
      notes: (a, b) => dir * ((a.hit.notes.total ?? -1) - (b.hit.notes.total ?? -1)),
      bpm: (a, b) => dir * ((a.s.bpm ?? -1) - (b.s.bpm ?? -1)),
      date: (a, b) => dir * cmpStr(a.s.date, b.s.date),
    };
    if (F.sort === 'default' && F.q && F.mode === 'fuzzy') out.sort((a, b) => b.score - a.score || by.default(a, b));
    else out.sort((a, b) => by[F.sort](a, b) || by.default(a, b));
    return out;
  }
  const cmpStr = (a, b) => (a || '').localeCompare(b || '');

  // 音击的对手（敌方角色）一览，按曲目数从多到少
  function charaList(d) {
    if (!d._charas) {
      const n = new Map();
      for (const s of d.songs) if (s.chara) n.set(s.chara, (n.get(s.chara) || 0) + 1);
      d._charas = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
    }
    return d._charas;
  }

  // ---- 筛选面板 ----
  function renderFilters() {
    const G = GAMES[game], d = data[game];
    const chips = (items, sel, attr) => items.map(([v, n]) => `<button class="chip ${sel.includes(v) ? 'on' : ''}" data-${attr}="${esc(v)}">${esc(n)}</button>`).join('');
    const used = new Set(d.songs.map(verOf));
    const vers = verList().filter((v) => used.has(v)).map((v) => [v, v]);
    $('#filters').innerHTML = `
      <div class="frow">
        <div class="search">
          <input id="q" type="search" placeholder="${F.mode === 'regex' ? '_ = 一个非空格字符，* = 一个以上非空格字符，例如 ら__ら、love*song' : '曲名 / 读音（片假名=平假名，忽略符号；不跨单词；用空格隔开可以搜几个词）'}" value="${esc(F.q)}" autocomplete="off">
          <div class="seg" id="mode"><button data-v="fuzzy" class="${F.mode === 'fuzzy' ? 'on' : ''}">模糊</button><button data-v="regex" class="${F.mode === 'regex' ? 'on' : ''}">正则</button></div>
        </div>
        <div class="fgroup"><span class="flabel">搜索</span>
          <select id="scope"><option value="title">曲名</option><option value="artist">艺术家</option><option value="designer">谱师</option></select>
        </div>
        <span class="err" id="err"></span>
      </div>
      <div class="frow">
        <div class="fgroup"><span class="flabel">定数</span>
          <input id="dsMin" type="number" step="0.1" min="1" max="16" placeholder="最低" value="${esc(F.dsMin)}"> –
          <input id="dsMax" type="number" step="0.1" min="1" max="16" placeholder="最高" value="${esc(F.dsMax)}">
          <label class="chk" title="定数还没公开的谱面${game === 'ongeki' ? '，有参考定数的用参考定数，没有的' : ''}按等级估算（13+ ≈ ${game === 'chunithm' ? '13.5' : '13.7'}）"><input type="checkbox" id="est" ${F.est ? 'checked' : ''}>未公开的按${game === 'ongeki' ? '参考值/' : ''}等级估</label>
        </div>
        <div class="fgroup"><span class="flabel">难度</span><div class="chips" id="diffs">${chips(G.high.map((k) => [k, G.diffs[k]]), F.diffs, 'diff')}</div></div>
      </div>
      <div class="frow">
        <div class="fgroup"><span class="flabel">种类</span><div class="chips" id="types">${chips(G.types, F.types, 'type')}</div></div>
        <div class="fgroup"><span class="flabel">分类</span><select id="cat"><option value="">全部</option>${d.categories.map((c) => `<option ${F.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        ${game === 'ongeki' ? `<div class="fgroup"><span class="flabel">对手</span><select id="chara"><option value="">全部</option>${charaList(d).map(([c, n]) => `<option value="${esc(c)}" ${F.chara === c ? 'selected' : ''}>${esc(c)}（${n}）</option>`).join('')}</select></div>` : ''}
        <div class="fgroup"><span class="flabel" title="只看这个服务器现在有的曲目，定数、等级、版本也按这个服务器显示">服务器</span><select id="region">${G.regions.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}<option value="all">全部（含已删除）</option></select></div>
        <div class="fgroup"><span class="flabel">排序</span><select id="sort">${SORTS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>
          <button class="icon-btn" id="dir" title="升序/降序">${F.desc ? '↓ 降序' : '↑ 升序'}</button></div>
        <button class="icon-btn" id="reset">重置筛选</button>
      </div>
      <details class="vers" ${F.vers.length ? 'open' : ''}>
        <summary>版本${F.vers.length ? `（已选 ${F.vers.length} 个）` : '（全部）'}</summary>
        <div class="chips" id="vers">${chips(vers, F.vers, 'ver')}<button class="chip ghost" id="verLatest">只看最新版本</button><button class="chip ghost" id="verClear">清空</button></div>
      </details>`;
    $('#scope').value = F.scope;
    $('#region').value = F.region;
    $('#sort').value = F.sort;
    $('#dir').disabled = F.sort === 'default';
  }

  function bindFilters() {
    const f = $('#filters');
    let t;
    f.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'q') { F.q = e.target.value; clearTimeout(t); t = setTimeout(refresh, 120); return; }
      if (id === 'dsMin' || id === 'dsMax') { F[id] = e.target.value; clearTimeout(t); t = setTimeout(refresh, 200); }
    });
    f.addEventListener('change', (e) => {
      const id = e.target.id;
      if (['scope', 'cat', 'chara', 'region', 'sort'].includes(id)) F[id] = e.target.value;
      else if (id === 'est') F.est = e.target.checked;
      else return;
      if (id === 'sort') $('#dir').disabled = F.sort === 'default';
      if (id === 'region') { F.vers = []; renderFilters(); } // 国服的版本名不一样
      refresh();
    });
    f.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
      if (b.parentElement.id === 'mode') {
        F.mode = b.dataset.v;
        for (const x of b.parentElement.children) x.classList.toggle('on', x === b);
        $('#q').placeholder = F.mode === 'regex' ? '_ = 一个非空格字符，* = 一个以上非空格字符，例如 ら__ら、love*song' : '曲名 / 读音（片假名=平假名，忽略符号；不跨单词；用空格隔开可以搜几个词）';
        $('#q').focus();
      } else if (b.dataset.diff) { F.diffs = toggle(F.diffs, b.dataset.diff); b.classList.toggle('on'); }
      else if (b.dataset.type) { F.types = toggle(F.types, b.dataset.type); b.classList.toggle('on'); }
      else if (b.dataset.ver) { F.vers = toggle(F.vers, b.dataset.ver); b.classList.toggle('on'); updVerSummary(); }
      else if (b.id === 'verClear') { F.vers = []; renderFilters(); }
      else if (b.id === 'verLatest') {
        const used = new Set(data[game].songs.map(verOf));
        const last = [...verList()].reverse().find((v) => used.has(v));
        F.vers = last ? [last] : [];
        renderFilters();
      }
      else if (b.id === 'dir') { F.desc = !F.desc; b.textContent = F.desc ? '↓ 降序' : '↑ 升序'; }
      else if (b.id === 'reset') { F = defaultFilter(game); renderFilters(); }
      else return;
      refresh();
    });
  }
  const updVerSummary = () => { $('#filters summary').textContent = `版本${F.vers.length ? `（已选 ${F.vers.length} 个）` : '（全部）'}`; };

  // ---- 列表 ----
  function lvChip(c, dim) {
    const G = GAMES[game];
    const v = view(c);
    if (!v) return '';
    const ds = v.ds != null ? v.ds.toFixed(1) : v.ref != null ? '~' + v.ref.toFixed(1) : noConst(c, v) || c.d === 'utage' ? '' : '?';
    const label = c.d === 'worldsend' ? c.lv : c.d === 'utage' ? `宴 ${v.lv}` : `${G.short[c.d]} ${v.lv}`;
    return `<span class="lv d-${c.d} ${dim ? 'dim' : ''}">${esc(label)}${ds ? `<span class="ds">${ds}</span>` : ''}</span>`;
  }
  function typeBadge(s) {
    if (game === 'maimai') return s.type === 'dx' ? '<span class="badge b-dx">DX</span>' : s.type === 'std' ? '<span class="badge b-std">STD</span>' : `<span class="badge b-utage">宴·${esc(s.kanji)}${s.buddy ? '·双人' : ''}</span>`;
    if (s.type === 'we') return `<span class="badge b-we">WE·${esc(s.kanji)}</span>`;
    if (s.type === 'lun') return '<span class="badge b-lun">LUNATIC</span>';
    return '';
  }
  function cardHtml({ s }) {
    const G = GAMES[game];
    const min = F.dsMin === '' ? null : +F.dsMin, max = F.dsMax === '' ? null : +F.dsMax;
    const charts = s.charts.filter((c) => G.high.includes(c.d));
    const lvs = charts.map((c) => {
      const v = dsOf(c);
      const inRange = F.diffs.includes(c.d) && (min == null || (v != null && v >= min - 1e-9)) && (max == null || (v != null && v <= max + 1e-9));
      return lvChip(c, !inRange);
    }).join('');
    return `<a class="card" href="#/${game}/song/${encodeURIComponent(s.id)}">
      <img class="jk" crossorigin="anonymous" loading="lazy" src="${cover(s)}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'" alt="">
      <div class="cbody">
        <div class="ctitle" title="${esc(s.title)}">${esc(s.title)}</div>
        <div class="cartist">${esc(s.artist)}</div>
        <div class="cmeta">${typeBadge(s)}${s._live ? '' : '<span class="badge b-gone">已删除</span>'}${s.isNew && (F.region === 'jp' || F.region === 'all') ? '<span class="badge b-new">NEW</span>' : ''}<span>${esc(verOf(s))}</span></div>
        <div class="lvs">${lvs}</div>
      </div></a>`;
  }
  function refresh() {
    saveFilter();
    results = filterSongs();
    $('#err').textContent = F._err || '';
    shown = 0;
    $('#grid').innerHTML = '';
    const d = data[game];
    $('#count').innerHTML = `<span><b>${results.length}</b> 首 / 共 ${d.songs.length} 条</span>`;
    if (!results.length) $('#grid').innerHTML = '<div class="empty">没有符合条件的曲目</div>';
    more();
  }
  function more() {
    const next = results.slice(shown, shown + PAGE);
    $('#grid').insertAdjacentHTML('beforeend', next.map(cardHtml).join(''));
    shown += next.length;
    $('#more').hidden = shown >= results.length;
    $('#more').textContent = `显示更多（还有 ${results.length - shown} 首）`;
  }

  // ---- 卡片页 ----
  function notesHtml(n) {
    const G = GAMES[game];
    if (!n || !n.total) return '<span class="na">未知</span>';
    return `<div class="notes"><span class="nt">总计 <b>${fmt(n.total)}</b></span>${G.kinds.filter(([k]) => n[k] != null).map(([k, name]) => `<span class="nt">${name} <b>${fmt(n[k])}</b></span>`).join('')}</div>`;
  }
  function tolHtml(n, ds, approx) {
    const C = Calc[game];
    const r = C.chart(n);
    if (!r) return '<div class="hint">物量未知，无法计算容错</div>';
    const rating = ds != null && C.rating ? C.rating(ds) : null;
    approx = approx ? '≈' : '';
    let head, row, unit;
    if (game === 'maimai') {
      head = '<th>评级</th><th>TAP GREAT</th><th>TAP GOOD</th><th>绝赞 50落</th>' + (rating ? '<th>Rating</th>' : '');
      // 绝赞 50落 不写能落几个，直接写每落一个扣多少（两个评级一样，合并成一格）
      row = (k) => `<td>${fmt(r[k].great)}</td><td>${fmt(r[k].good)}</td>` + (k === C.ranks[0].key ? `<td rowspan="${C.ranks.length}">${r.unit.brk50 == null ? '—' : `−${r.unit.brk50.toFixed(4)}%`}</td>` : '');
      unit = `1 TAP GREAT = −${r.unit.great.toFixed(4)}%　1 TAP GOOD = −${r.unit.good.toFixed(4)}%　1 TAP MISS = −${r.unit.miss.toFixed(4)}%` + (r.unit.brk100 != null ? `　1 绝赞 100落 = −${r.unit.brk100.toFixed(4)}%` : '') + `　DX 分理论值 ${fmt(r.dxMax)}`;
    } else if (game === 'chunithm') {
      head = '<th>评级</th><th>JUSTICE</th><th>ATTACK</th>' + (rating ? '<th>Rating</th>' : '');
      row = (k) => `<td>${fmt(r[k].justice)}</td><td>${fmt(r[k].attack)}</td>`;
      unit = `1 JUSTICE = −${fmt(r.unit.justice, 1)}　1 ATTACK = −${fmt(r.unit.attack, 1)}　1 MISS = −${fmt(r.unit.miss, 1)}`;
    } else {
      head = '<th>评级</th><th>BREAK</th><th>HIT</th><th>漏 BELL</th>' + (rating ? '<th>Rating</th>' : '');
      row = (k) => `<td>${fmt(r[k].brk)}</td><td>${fmt(r[k].hit)}</td><td>${r[k].bell == null ? '—' : fmt(r[k].bell)}</td>`;
      unit = `1 BREAK = −${fmt(r.unit.brk, 1)}　1 HIT = −${fmt(r.unit.hit, 1)}　1 MISS = −${fmt(r.unit.miss, 1)}` + (r.unit.bell != null ? `　漏 1 BELL = −${fmt(r.unit.bell, 1)}` : '');
      if (rating) unit += `　Rating 理论值 ${approx}${C.ratingMax(ds).toFixed(3)}`;
    }
    const rows = C.ranks.map((rk) => `<tr><td class="rk">${rk.name}</td>${row(rk.key)}${rating ? `<td>${approx}${game === 'chunithm' ? rating[rk.key].toFixed(2) : game === 'ongeki' ? rating[rk.key].toFixed(3) : rating[rk.key]}</td>` : ''}</tr>`).join('');
    return `<div class="tblwrap"><table class="tol"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div><div class="hint">${unit.split('　').map((u) => `<span class="nw">${u}</span>`).join(' ')}</div>${C.platinum ? platHtml(n.total, ds, approx) : ''}`;
  }
  // 音击 Re:Fresh 的プラチナスコア：各星级需要的分数和 ★5 的星级 Rating
  function platHtml(total, ds, approx) {
    const p = Calc.ongeki.platinum(total, ds);
    if (!p) return '';
    const name = (n) => (n === 6 ? '虹★' : '★' + n);
    return `<div class="plat">${p.stars.map((x) => `<div><span class="st">${name(x.n)}<small>${x.pct}%</small></span><b>${fmt(x.need)}</b></div>`).join('')}</div>
      <div class="hint">プラチナスコア理论值 ${fmt(p.max)}${p.rating5 != null ? `　★5 星级 Rating ${approx}${p.rating5.toFixed(3)}` : ''}</div>`;
  }
  // 卡片页最后的计算说明（每首歌都一样，所以折叠起来只放一次）
  function helpHtml(g) {
    const common = [
      '容错 = 只出这一种失误时最多能出几个，其余全部最高判定。',
      '定数前的 ≈ 表示定数未公开，按参考值或等级估算；~ 表示参考定数（未确认）。',
    ];
    const per = {
      maimai: [
        '容错前提：其余全部 CRITICAL PERFECT。基础 100% 按 TAP·TOUCH 1、HOLD 2、SLIDE 3、BREAK 5 的权重平分，绝赞奖励 1% 按 BREAK 数平分；TAP GREAT 少 0.2 权重、GOOD 少 0.5，绝赞 50落 奖励只剩 75%、100落 只剩 50%。',
        'Rating：SSS+ = ⌊定数 × 22.4 × 1.005⌋，SSS = ⌊定数 × 21.6⌋。DX 分理论值 = 物量 × 3。',
        '各服务器的定数并排显示，和当前服务器不同的标成橙色；定数筛选、排序和 Rating 都按列表上方选的「服务器」。',
      ],
      chunithm: [
        '容错前提：其余全部 JUSTICE CRITICAL。1,010,000 按物量平分，JUSTICE 少 1/101，ATTACK 少 51/101，MISS 全扣。',
        'Rating：SSS+（1,009,000）= 定数 + 2.15，SSS（1,007,500）= 定数 + 2.00。',
        '各服务器的定数并排显示，和当前服务器不同的标成橙色；国际服带 * 的是没有单独数据、按日服显示的值。',
      ],
      ongeki: [
        '容错前提：其余全部 CRITICAL BREAK、BELL 全收、无被弹。判定 950,000 按物量平分（BREAK 90%、HIT 50%），BELL 60,000 按 BELL 数平分。',
        `Rating 是 Re:Fresh 的テクニカル部分，不含灯加成：${Calc.ongeki.lamps.map(([n, v]) => `${n} +${(v / 1000).toFixed(3)}`).join('、')}（FULL BELL 可以和其他灯叠加）。理论值 = 1,010,000 + AB+ + FULL BELL。`,
        'プラチナスコア理论值 = 物量 × 2，★1〜★5 / 虹★ 需要理论值的 94%〜99%；星级 Rating = ⌊★数 × 定数²⌋ ÷ 1000（虹★ 同 ★5）。',
      ],
    };
    return `<details class="help"><summary>计算说明</summary><ul>${[...common, ...per[g]].map((x) => `<li>${x}</li>`).join('')}</ul></details>`;
  }
  // 卡片页的难度选项：难度名 + 等级（定数）
  function diffTab(c, on, i) {
    const G = GAMES[game];
    const v = view(c) || viewIn(c, 'all');
    const lv = c.d === 'worldsend' ? c.lv : v?.ds != null ? v.ds.toFixed(1) : v?.lv ?? '';
    return `<button class="dtab dt-${c.d} ${on ? 'on' : ''} ${view(c) ? '' : 'gone'}" role="tab" data-i="${i}">
      <span class="full">${esc(G.diffs[c.d])}</span><span class="short">${esc(G.short[c.d])}</span><small>${esc(lv)}</small></button>`;
  }
  // 各服务器的等级 / 定数，和当前服务器不同的标出来
  function dsAcross(c) {
    const G = GAMES[game];
    const sel = F.region === 'all' ? 'jp' : F.region;
    const cur = viewIn(c, sel);
    const parts = G.regions.map(([k, n]) => {
      const v = viewIn(c, k);
      let txt = !v ? '未实装' : v.ds != null ? v.ds.toFixed(1) : v.ref != null ? `${v.ref.toFixed(1)}（参考，未确认）` : `Lv ${v.lv ?? '?'}（未公开）`;
      // 中二国际服没有单独的定数数据，显示的是日服的值
      const guess = k === 'intl' && game === 'chunithm' && v;
      if (guess) txt += '*';
      const differ = cur && v && (v.ds !== cur.ds || v.lv !== cur.lv);
      return `<span class="sv ${k === sel ? 'on' : ''} ${differ ? 'differ' : ''}" ${guess ? 'title="没有国际服单独的定数数据，这里是日服的值"' : ''}>${n} ${esc(txt)}</span>`;
    });
    return `<div class="svs">${parts.join('')}</div>`;
  }
  function chartCard(s, c) {
    const G = GAMES[game];
    const missing = !view(c);
    const v = view(c) || viewIn(c, 'all') || { lv: c.lv, ds: null };
    const nc = noConst(c, v);
    const ds = nc ? null : v.ds ?? v.ref ?? estLv(v.lv);
    const big = c.d === 'worldsend' ? esc(s.kanji) + `<small>${'☆'.repeat(s.star || 0)}</small>`
      : nc ? `<small>Lv</small> ${esc(v.lv)}`
      : v.ds != null ? v.ds.toFixed(1) + `<small>Lv ${esc(v.lv)}</small>`
      : v.ref != null ? `~${v.ref.toFixed(1)}<small>Lv ${esc(v.lv)} 参考定数</small>`
      : `${esc(v.lv)}<small>定数未公开</small>`;
    let tol;
    if (c.left && c.right) {
      tol = `<div><b>左（1P）</b></div>${notesHtml(c.left)}${tolHtml(c.left, null)}<div><b>右（2P）</b></div>${notesHtml(c.right)}${tolHtml(c.right, null)}`;
    } else tol = tolHtml(c.notes, c.d === 'utage' || nc ? null : ds, v.ds == null);
    const svName = SERVER[F.region] || '日服';
    return `<div class="chart">
      <div class="chart-h d-${c.d}"><span class="dn">${esc(G.diffs[c.d] || c.d)}</span>${missing ? `<span class="miss">${c.gone ? '已删除' : svName + '未实装'}</span>` : ''}<span class="big">${big}</span></div>
      <div class="chart-b">
        <div class="kv">
          ${nc ? `<span>等级</span><span>${esc(c.d === 'worldsend' ? c.lv : v.lv)}</span>` : `<span>${c.d === 'utage' ? '等级' : '定数'}</span><span>${dsAcross(c)}</span>`}
          <span>谱师</span><span>${c.des ? esc(c.des) : '<span class="na">未知</span>'}</span>
          ${c.link ? `<span>谱面</span><span><a href="https://sdvx.in/${game}/${esc(c.link)}.htm" target="_blank" rel="noopener">谱面确认（sdvx.in）↗</a></span>` : ''}
          ${c.ver && c.ver !== s.ver ? `<span>追加版本</span><span>${esc(c.ver)}</span>` : ''}
          <span>物量</span><span>${notesHtml(c.notes)}</span>
        </div>
        ${tol}
      </div></div>`;
  }
  // 各服务器版本一样时只显示一行
  function versionRows(s) {
    const rows = [['日服', s.ver], ['国际服', s.verIntl ?? (s.regions?.intl ? s.ver : null)], ['国服', s.verCn]]
      .filter(([n, v]) => v && GAMES[game].regions.some(([, x]) => x === n));
    if (!rows.length) return [];
    return rows.every(([, v]) => v === rows[0][1]) ? [['版本', rows[0][1]]] : rows.map(([n, v]) => [`${n}版本`, v]);
  }
  // 艺术家名只在「／」「/」和括号前这些自然的地方换行（「曲：…／歌：…(CV：…)」不会从名字中间断开）
  function artistHtml(a) {
    return String(a ?? '').split(/(?<=[／/、,])|(?=[（(「])/).map((x) => (x.length <= 18 ? `<span class="nw0">${esc(x)}</span>` : esc(x))).join('');
  }
  function regionText(s) {
    const G = GAMES[game];
    const on = G.regions.filter(([k]) => s.regions?.[k]).map(([, n]) => n);
    return on.length ? on.join('、') : '已删除（现在各服都没有）';
  }
  async function showDetail(g, id) {
    await switchGame(g, false);
    if (game !== g) return; // 读取失败，或期间又切走了
    const d = data[g];
    const s = d.songs.find((x) => x.id === id);
    const G = GAMES[g];
    if (!$('#listView').hidden) listScroll = window.scrollY;
    $('#listView').hidden = true;
    const v = $('#detailView');
    v.hidden = false;
    if (!s) { v.innerHTML = `<button class="back" id="back">← 返回列表</button><div class="empty">找不到这首曲目</div>`; return; }
    document.title = `${s.title} - SBGA TOOL`;
    const order = Object.keys(G.diffs);
    const charts = [...s.charts].sort((a, b) => order.indexOf(a.d) - order.indexOf(b.d));
    const pick = charts.length - 1; // 默认最高难度
    const nt = s._nt;
    const related = d.songs.filter((x) => x !== s && x._nt === nt);
    // 种类已经写在曲名上方的标签里；音击只有日服，「收录」每首都一样，所以都不再列
    const rival = s.chara ? s.chara + ([s.element, s.enemyLv != null ? `Lv ${s.enemyLv}` : null].filter(Boolean).join(' · ').replace(/^(.+)$/, '（$1）')) : null;
    const meta = [
      ['分类', s.cat], ...versionRows(s), ['BPM', s.bpm ?? '—'], ['实装日期', s.date],
      ...(G.regions.length > 1 ? [['收录', regionText(s)]] : []),
      ...(g === 'ongeki' ? [['对手', rival], ['章节', s.chapter], ['Bonus Track', s.bonus ? '是' : null]] : []),
      ...(s.type === 'we' ? [['难度', s.kanji + '☆'.repeat(s.star || 0)]] : []),
    ].filter(([, x]) => x != null && x !== '');
    v.innerHTML = `
      <button class="back" id="back">← 返回列表</button>
      <div class="hero${(s.artist || '').length > 30 ? ' long-artist' : ''}">
        <img class="jk" crossorigin="anonymous" src="${cover(s)}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'" alt="">
        <div class="hero-head">
          <div class="cmeta" style="margin-bottom:4px">${typeBadge(s)}${s._live ? '' : '<span class="badge b-gone">已删除</span>'}${s.isNew && (F.region === 'jp' || F.region === 'all') ? '<span class="badge b-new">NEW</span>' : ''}</div>
          <h2>${esc(s.title)}</h2>
          ${s.reading ? `<div class="reading">${esc(s.reading)}</div>` : ''}
          <div class="artist a-head">${artistHtml(s.artist)}</div>
        </div>
        <div class="hero-body">
          <div class="artist a-body">${artistHtml(s.artist)}</div>
          <div class="meta">${meta.map(([k, x]) => `<div${String(x).length > 24 ? ' class="long"' : ''}><span>${k}</span>${esc(x)}</div>`).join('')}</div>
          ${s.comment ? `<div class="comment">${esc(s.comment)}</div>` : ''}
          <div class="related">${s.wiki ? `<a href="${esc(s.wiki)}" target="_blank" rel="noopener">wiki ↗</a>` : ''}
            ${related.length ? `<span>同名的其他条目：</span>${related.map((x) => `<a class="chip" href="#/${g}/song/${encodeURIComponent(x.id)}">${x.type === 'utage' || x.type === 'we' ? (x.type === 'utage' ? '宴·' : 'WE·') + esc(x.kanji) : esc(G.types.find((t) => t[0] === x.type)?.[1])}${x.artist !== s.artist ? ' · ' + esc(x.artist) : ''}</a>`).join('')}` : ''}</div>
        </div>
      </div>
      <h3>谱面${GAMES[g].regions.length > 1 ? ` <span class="hint">定数和 Rating 按${SERVER[F.region] || '日服'}</span>` : ''}</h3>
      <div class="dtabs" role="tablist">${charts.map((c, i) => diffTab(c, i === pick, i)).join('')}</div>
      <div class="chartpanel">${chartCard(s, charts[pick])}</div>
      ${helpHtml(g)}`;
    v.querySelector('.dtabs').addEventListener('click', (e) => {
      const b = e.target.closest('.dtab');
      if (!b) return;
      for (const x of v.querySelectorAll('.dtab')) x.classList.toggle('on', x === b);
      v.querySelector('.chartpanel').innerHTML = chartCard(s, charts[+b.dataset.i]);
    });
    window.scrollTo(0, 0);
  }

  // ---- 切换游戏 / 路由 ----
  let switching = 0;
  async function switchGame(g, showList = true) {
    if (!GAMES[g]) g = 'maimai';
    const changed = g !== game || !F;
    document.body.dataset.game = g;
    for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.game === g);
    store.set('songs.game', g);
    if (changed) {
      const token = ++switching;
      $('#grid').innerHTML = '<div class="empty">读取中…</div>';
      $('#filters').innerHTML = '';
      $('#count').innerHTML = '';
      try { await loadData(g); } catch (e) { $('#grid').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
      if (token !== switching) return; // 读取期间又切到了别的游戏
      game = g;
      F = loadFilter(g);
      renderFilters();
      const d = data[g];
      $('#dataTime').textContent = `数据 ${d.sourceTime ? d.sourceTime.slice(0, 10) : d.generated.slice(0, 10)}`;
      refresh();
    }
    if (showList) {
      document.title = `${GAMES[g].name} - SBGA TOOL`;
      $('#detailView').hidden = true;
      const wasHidden = $('#listView').hidden;
      $('#listView').hidden = false;
      if (wasHidden && !changed) window.scrollTo(0, listScroll);
    }
  }
  function route() {
    const m = location.hash.match(/^#\/(\w+)(?:\/song\/(.+))?$/);
    if (m && m[2]) return showDetail(m[1], decodeURIComponent(m[2]));
    return switchGame(m ? m[1] : store.get('songs.game') || 'maimai');
  }

  // ---- 主题 ----
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    $('#themeBtn').textContent = t === 'dark' ? '☾' : t === 'light' ? '☀' : '◐';
    $('#themeBtn').title = t === 'dark' ? '深色（点击切换）' : t === 'light' ? '浅色（点击切换）' : '跟随系统（点击切换）';
  }
  $('#themeBtn').addEventListener('click', () => {
    const order = [null, 'dark', 'light'];
    const cur = store.get('songs.theme');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    store.set('songs.theme', next);
    applyTheme(next);
  });
  applyTheme(store.get('songs.theme'));

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) location.hash = `#/${b.dataset.game}`;
  });
  $('#more').addEventListener('click', more);
  $('#detailView').addEventListener('click', (e) => {
    if (e.target.id !== 'back') return;
    location.hash = `#/${game}`;
  });
  window.addEventListener('hashchange', route);
  // 列表滚到底自动加载更多
  new IntersectionObserver((es) => { if (es[0].isIntersecting && !$('#more').hidden && !$('#listView').hidden) more(); }, { rootMargin: '600px' }).observe($('#more'));
  // 安卓 App（Capacitor）里：target=_blank 的外部链接（wiki、sdvx.in…）在 WebView 里打不开，改成普通跳转，
  // Capacitor 会把站外地址交给系统浏览器打开
  if (window.Capacitor?.isNativePlatform?.()) {
    document.documentElement.classList.add('native');
    // 安卓返回键：卡片页等能后退时后退，已经在最开始的页面时退出 App（@capacitor/app 插件）
    const NativeApp = window.Capacitor.Plugins?.App;
    NativeApp?.addListener('backButton', ({ canGoBack }) => (canGoBack ? history.back() : NativeApp.exitApp()));
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[target="_blank"]');
      if (!a) return;
      e.preventDefault();
      window.location.href = a.href;
    });
  }
  // 网页版（PWA）：注册离线缓存。安卓 App 和直接双击打开（file://）时不用
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.Capacitor?.isNativePlatform?.()) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  bindFilters();
  route();
})();
