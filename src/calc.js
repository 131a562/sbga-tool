// 容错和 Rating 计算（每个游戏一组）
// 所有「容错」都按「其余全部最高判定」算：maimai 绝赞全部 CRITICAL PERFECT，中二其余全部 JUSTICE CRITICAL，音击 BELL 全收、无被弹。
(function () {
  const floor = (x) => Math.floor(x + 1e-9);

  // ---- maimai DX ----
  // 达成率 = 基础分 100%（TAP/TOUCH 1、HOLD 2、SLIDE 3、BREAK 5 的权重平分）+ 绝赞奖励 1%（BREAK 平分）
  // TAP GREAT 得 80% → 少 0.2 个单位；绝赞 PERFECT(2550/50落) 奖励只剩 75%，PERFECT(2500/100落) 只剩 50%
  function maimaiChart(n) {
    if (!n || n.tap == null || !n.total) return null;
    const W = (n.tap || 0) + (n.touch || 0) + 2 * (n.hold || 0) + 3 * (n.slide || 0) + 5 * (n.break || 0);
    const B = n.break || 0;
    const great = (0.2 / W) * 100; // 一个 TAP GREAT 损失的达成率(%)
    const good = (0.5 / W) * 100;
    const miss = (1 / W) * 100; // 一个 TAP MISS
    const brk50 = B ? 0.25 / B : null; // 一个绝赞 50 落
    const brk100 = B ? 0.5 / B : null;
    const tol = (budget) => ({ great: floor(budget / great), good: floor(budget / good), brk50: B ? floor(budget / brk50) : null });
    // 理论值 101%：SSS+（100.5%）能扣 0.5%，SSS（100.0%）能扣 1.0%
    return {
      unit: { great, good, miss, brk50, brk100 },
      sssp: tol(0.5),
      sss: tol(1.0),
      dxMax: n.total * 3,
    };
  }
  const maimaiRating = (ds, ach, factor) => floor((ds * factor * Math.min(ach, 100.5)) / 100);

  // ---- CHUNITHM ----
  // 理论值 1,010,000 按物量（combo 数）平分；JUSTICE 少 1%，ATTACK 少 51%，MISS 少 101%（都相对 1,000,000/物量）
  function chuniChart(n) {
    if (!n || !n.total) return null;
    const N = n.total;
    const j = 10000 / N, a = 510000 / N;
    const tol = (budget) => ({ justice: floor(budget / j), attack: floor(budget / a) });
    return { unit: { justice: j, attack: a, miss: 1010000 / N }, sssp: tol(1000), sss: tol(2500) };
  }

  // ---- オンゲキ ----
  // テクニカルスコア = 判定 950,000（按物量平分，BREAK 90%、HIT 50%）+ BELL 60,000（按 BELL 数平分）
  function ongekiChart(n) {
    if (!n || !n.total) return null;
    const N = n.total;
    const brk = 95000 / N, hit = 475000 / N, miss = 950000 / N, bell = n.bell ? 60000 / n.bell : null;
    const tol = (budget) => ({ brk: floor(budget / brk), hit: floor(budget / hit), bell: bell ? floor(budget / bell) : null });
    return { unit: { brk, hit, miss, bell }, sssp: tol(2500), sss: tol(10000) };
  }

  // Re:Fresh 的单曲 Rating（テクニカルスコア部分，不含灯加成），按千分之一计算，和 Tachi 的实现一致
  // SSS+ 以上：定数 + 1.75 + (分数−1,007,500)/2500×0.25 + 0.3；SSS：+1.25 + (分数−1,000,000)/7500×0.5 + 0.2
  function ongekiRating(ds, score, bonus = 0) {
    let r = Math.round(ds * 1000);
    if (score >= 1007500) r += 1750 + Math.trunc((250 * (score - 1007500)) / 2500) + 300;
    else if (score >= 1000000) r += 1250 + Math.trunc((500 * (score - 1000000)) / 7500) + 200;
    return (r + bonus) / 1000;
  }
  // プラチナスコア：理论值 = 物量 × 2；★n 需要达到理论值的 (93+n)%，虹 ★ 是 99%
  // 星级 Rating = ⌊★数 × 定数²⌋ / 1000（虹 ★ 按 ★5 算）
  function ongekiPlatinum(total, ds) {
    if (!total) return null;
    const max = total * 2;
    const stars = [1, 2, 3, 4, 5, 6].map((n) => ({ n, pct: 93 + n, need: Math.ceil((max * (93 + n)) / 100) }));
    return { max, stars, rating5: ds != null ? Math.floor(5 * ds * ds) / 1000 : null };
  }

  // maimai 的 DX 分：理论值 = 物量 × 3；✦1〜✦5 需要理论值的 85% / 90% / 93% / 95% / 97%
  function maimaiDxStars(total) {
    if (!total) return null;
    const max = total * 3;
    const stars = [85, 90, 93, 95, 97].map((pct, i) => ({ n: i + 1, pct, need: Math.ceil((max * pct) / 100) }));
    return { max, stars };
  }

  window.Calc = {
    maimai: {
      chart: maimaiChart,
      ranks: [
        { key: 'sssp', name: 'SSS+', need: '100.5000%' },
        { key: 'sss', name: 'SSS', need: '100.0000%' },
      ],
      rating: (ds) => ({ sssp: maimaiRating(ds, 100.5, 22.4), sss: maimaiRating(ds, 100, 21.6) }),
      dxStars: maimaiDxStars,
    },
    chunithm: {
      chart: chuniChart,
      ranks: [
        { key: 'sssp', name: 'SSS+', need: '1,009,000' },
        { key: 'sss', name: 'SSS', need: '1,007,500' },
      ],
      rating: (ds) => ({ sssp: +(ds + 2.15).toFixed(2), sss: +(ds + 2).toFixed(2) }),
    },
    ongeki: {
      chart: ongekiChart,
      ranks: [
        { key: 'sssp', name: 'SSS+', need: '1,007,500' },
        { key: 'sss', name: 'SSS', need: '1,000,000' },
      ],
      rating: (ds) => ({ sssp: ongekiRating(ds, 1007500), sss: ongekiRating(ds, 1000000) }),
      ratingMax: (ds) => ongekiRating(ds, 1010000, 350 + 50),
      lamps: [['FB', 50], ['FC', 100], ['AB', 300], ['AB+', 350]],
      platinum: ongekiPlatinum,
    },
  };
})();
