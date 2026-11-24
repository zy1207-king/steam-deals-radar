/* ==========================================================================
   Steam 特惠雷达 · 交互逻辑
   数据来源：data/specials.js（同步快照，规避 CORS）
              data/specials.json（点击刷新 / 定时同步时拉取，同域）
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.STEAM_DEALS_DATA || null;

  var state = {
    region: 'CN',
    keyword: '',
    filter: 'all',
    sort: 'discount'
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    grid: $('#dealsGrid'),
    empty: $('#emptyState'),
    search: $('#searchInput'),
    clearSearch: $('#clearSearch'),
    chips: $('#filterChips'),
    sort: $('#sortSelect'),
    regionSwitch: $('#regionSwitch'),
    refresh: $('#refreshBtn'),
    reset: $('#resetBtn'),
    resultCount: $('#resultCount'),
    dataNote: $('#dataNote'),
    updateTime: $('#updateTime'),
    footerUpdated: $('#footerUpdated'),
    toast: $('#toast'),
    endingSoon: $('#endingSoon'),
    endingGrid: $('#endingGrid'),
    endingSub: $('#endingSub'),
    statCount: $('#statCount'),
    statAvg: $('#statAvg'),
    statAvgOff: $('#statAvgOff'),
    statMax: $('#statMax'),
    statMaxName: $('#statMaxName'),
    statSaving: $('#statSaving')
  };

  // --------------------------------------------------------------------- //
  // 愿望单（localStorage），价格按区域分别记录历史最低，用于降价提醒
  // --------------------------------------------------------------------- //
  var WISH_KEY = 'steam_radar_wishlist_v1';

  function loadWishlist() {
    try { return JSON.parse(localStorage.getItem(WISH_KEY)) || {}; }
    catch (err) { return {}; }
  }
  function saveWishlist() {
    try { localStorage.setItem(WISH_KEY, JSON.stringify(wishlist)); } catch (err) { /* 隐私模式下忽略 */ }
  }
  var wishlist = loadWishlist();

  function toggleWish(id, item) {
    if (wishlist[id]) {
      delete wishlist[id];
      toast('已从愿望单移除「' + item.name + '」');
    } else {
      wishlist[id] = {
        name: item.name,
        added_at: Date.now(),
        prices: {},
        base: {}
      };
      wishlist[id].prices[state.region] = Number(item.final_price) || 0;
      wishlist[id].base[state.region] = Number(item.final_price) || 0;
      toast('❤ 已加入愿望单，降到新低时会提醒你');
    }
    saveWishlist();
  }

  // 对比历史最低价：发现新低时提示（prices 记录各区域最低价，幂等安全）
  function checkPriceDrops(items) {
    var drops = [];
    items.forEach(function (item) {
      var w = wishlist[item.id];
      if (!w) return;
      var now = Number(item.final_price) || 0;
      w.prices = w.prices || {};
      w.base = w.base || {};
      if (w.prices[state.region] == null) {
        // 首次在该区域见到，先记录基准价
        w.prices[state.region] = now;
        if (w.base[state.region] == null) w.base[state.region] = now;
        return;
      }
      if (now < w.prices[state.region] - 0.001) {
        var region = regionData() || { symbol: '' };
        drops.push(item.name + '：' + region.symbol + now.toFixed(2) + '（原记录 ' + region.symbol + w.prices[state.region].toFixed(2) + '）');
        w.prices[state.region] = now;
      }
    });
    if (drops.length) {
      saveWishlist();
      toast('❤ 愿望单降价提醒 → ' + drops.slice(0, 2).join('；') + (drops.length > 2 ? ' 等 ' + drops.length + ' 款' : ''));
    }
  }

  function isWished(id) { return !!wishlist[id]; }

  var PLACEHOLDER =
    'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#1b3550"/><stop offset="1" stop-color="#0c1722"/>' +
      '</linearGradient></defs>' +
      '<rect width="460" height="215" fill="url(#g)"/>' +
      '<circle cx="230" cy="107" r="42" fill="none" stroke="#66c0f4" stroke-opacity=".35" stroke-width="2"/>' +
      '<circle cx="230" cy="107" r="24" fill="none" stroke="#66c0f4" stroke-opacity=".5" stroke-width="2"/>' +
      '<circle cx="230" cy="107" r="5" fill="#66c0f4" fill-opacity=".8"/>' +
      '<text x="230" y="180" fill="#8ea3bb" font-size="15" font-family="sans-serif" text-anchor="middle">STEAM DEALS RADAR</text>' +
      '</svg>'
    );

  // --------------------------------------------------------------------- //
  // 工具函数
  // --------------------------------------------------------------------- //
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function money(n, symbol) {
    var num = Number(n) || 0;
    return symbol + num.toFixed(2);
  }

  function compactMoney(n, symbol) {
    var num = Number(n) || 0;
    if (num >= 10000) return symbol + (num / 10000).toFixed(1) + '万';
    return symbol + Math.round(num).toLocaleString('zh-CN');
  }

  function regionData() {
    if (!DATA || !DATA.regions) return null;
    return DATA.regions[state.region] || DATA.regions[Object.keys(DATA.regions)[0]] || null;
  }

  var toastTimer = null;
  function toast(message) {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 2800);
  }

  function remaining(ts) {
    if (!ts) return { text: '限时特惠 · 以商店为准', cls: 'none' };
    var diff = Number(ts) * 1000 - Date.now();
    if (diff <= 0) return { text: '优惠可能已结束', cls: 'none' };
    var totalHours = Math.floor(diff / 3600000);
    var days = Math.floor(totalHours / 24);
    if (days >= 1) {
      return { text: '剩 ' + days + ' 天 ' + (totalHours % 24) + ' 小时', cls: days < 1 ? 'urgent' : '' };
    }
    var hours = totalHours;
    var minutes = Math.floor(diff / 60000) % 60;
    var seconds = Math.floor(diff / 1000) % 60;
    return { text: '剩 ' + pad(hours) + ':' + pad(minutes) + ':' + pad(seconds), cls: 'urgent' };
  }

  // --------------------------------------------------------------------- //
  // 筛选 / 排序
  // --------------------------------------------------------------------- //
  function getVisible(items) {
    var kw = state.keyword.trim().toLowerCase();
    var list = items.filter(function (item) {
      if (kw && String(item.name).toLowerCase().indexOf(kw) === -1) return false;
      switch (state.filter) {
        case '50': return item.discount_percent >= 50;
        case '75': return item.discount_percent >= 75;
        case '90': return item.discount_percent >= 90;
        case 'free': return Number(item.final_price) === 0;
        case 'wishlist': return isWished(item.id);
        default: return true;
      }
    });

    list.sort(function (a, b) {
      switch (state.sort) {
        case 'saving':
          return (b.original_price - b.final_price) - (a.original_price - a.final_price);
        case 'price':
          return a.final_price - b.final_price;
        case 'expiry':
          return (a.expires_at || Infinity) - (b.expires_at || Infinity);
        case 'name':
          return String(a.name).localeCompare(String(b.name), 'zh-CN');
        default:
          return b.discount_percent - a.discount_percent || a.final_price - b.final_price;
      }
    });
    return list;
  }

  // --------------------------------------------------------------------- //
  // 渲染
  // --------------------------------------------------------------------- //
  function cardHTML(item, region, index) {
    var pct = item.discount_percent || 0;
    var isFree = Number(item.final_price) === 0;
    var lv = pct >= 90 ? 'lv3' : (pct >= 75 ? 'lv2' : '');
    var badgeCls = 'badge-discount ' + lv + (isFree ? ' badge-free' : '');
    var badgeText = isFree ? '免费' : '-' + pct + '%';
    var save = Math.max(0, Number(item.original_price) - Number(item.final_price));
    var time = remaining(item.expires_at);
    var sourceLabel = item.source === 'featured' ? '今日精选' : '深度折扣';
    var sourceCls = item.source === 'featured' ? '' : 'deep';
    var wished = isWished(item.id);
    var w = wishlist[item.id];
    var saveNote = '';
    if (w && w.base && w.base[state.region] != null &&
        Number(item.final_price) < w.base[state.region] - 0.001) {
      saveNote = '<span class="price-saving drop">↓ 已降至新低</span>';
    } else if (save > 0) {
      saveNote = '<span class="price-saving">省 ' + money(save, region.symbol) + '</span>';
    }

    return '' +
      '<article class="deal-card" style="animation-delay:' + Math.min(index * 22, 380) + 'ms">' +
        '<div class="card-media">' +
          '<button type="button" class="wish-btn' + (wished ? ' active' : '') + '" data-id="' + esc(item.id) + '" ' +
            'title="' + (wished ? '点击移出愿望单' : '加入愿望单，降价提醒') + '" aria-label="愿望单">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.7-10-9.3C.4 8.6 2.4 5 5.9 5c2 0 3.4 1.1 4.1 2.3h4c.7-1.2 2.1-2.3 4.1-2.3 3.5 0 5.5 3.6 3.9 6.7-2.5 4.6-10 9.3-10 9.3Z" fill="currentColor"/></svg>' +
          '</button>' +
          '<span class="' + badgeCls + '">' + badgeText + '</span>' +
          '<img src="' + esc(item.header_image || PLACEHOLDER) + '" alt="' + esc(item.name) + ' 封面" ' +
               'loading="lazy" data-appid="' + esc(item.id) + '" />' +
          '<span class="badge-source ' + sourceCls + '">' + sourceLabel + '</span>' +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title" title="' + esc(item.name) + '">' + esc(item.name) + '</h3>' +
          '<div class="price-row">' +
            '<span class="price-old">' + money(item.original_price, region.symbol) + '</span>' +
            '<span class="price-new' + (isFree ? ' free' : '') + '">' +
              (isFree ? '免费开玩' : money(item.final_price, region.symbol)) +
            '</span>' +
            (saveNote) +
          '</div>' +
          '<div class="card-meta">' +
            '<span class="countdown ' + time.cls + '"' +
              (item.expires_at ? ' data-expires="' + Number(item.expires_at) + '"' : '') +
            '>' + time.text + '</span>' +
          '</div>' +
          '<a class="card-cta" href="' + esc(item.store_url) + '" target="_blank" rel="noopener noreferrer">' +
            '前往 Steam 商店' +
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</a>' +
        '</div>' +
      '</article>';
  }

  function bindImageFallback() {
    $$('.card-media img', els.grid).forEach(function (img) {
      img.addEventListener('error', function onError() {
        var stage = img.dataset.fallback || '0';
        if (stage === '0') {
          img.dataset.fallback = '1';
          img.src = 'https://cdn.cloudflare.steamstatic.com/steam/apps/' +
                    encodeURIComponent(img.dataset.appid || '') + '/header.jpg';
        } else if (stage === '1') {
          img.dataset.fallback = '2';
          img.src = PLACEHOLDER;
        } else {
          img.removeEventListener('error', onError);
          img.style.visibility = 'hidden';
        }
      });
    });
  }

  function renderStats(items, region) {
    if (!items.length) {
      els.statCount.textContent = '0';
      els.statAvg.textContent = '—';
      els.statAvgOff.textContent = '—';
      els.statMax.textContent = '—';
      els.statMaxName.textContent = '暂无数据';
      els.statSaving.textContent = '—';
      return;
    }
    var totalPct = 0, maxPct = 0, maxName = '', totalSaving = 0;
    items.forEach(function (item) {
      totalPct += item.discount_percent || 0;
      totalSaving += Math.max(0, Number(item.original_price) - Number(item.final_price));
      if ((item.discount_percent || 0) > maxPct) {
        maxPct = item.discount_percent || 0;
        maxName = item.name;
      }
    });
    var avg = Math.round(totalPct / items.length);
    els.statCount.textContent = String(items.length);
    els.statAvg.textContent = avg + '%';
    els.statAvgOff.textContent = avg + '%';
    els.statMax.textContent = '-' + maxPct + '%';
    els.statMaxName.textContent = maxName;
    els.statSaving.textContent = compactMoney(totalSaving, region.symbol);
  }

  // --------------------------------------------------------------------- //
  // 即将结束专区：优先展示 24 小时内截止的特惠；若暂无，则展示剩余时间
  // 最短的前 8 款，保证"临近窗口"始终有内容。均按剩余时间升序。
  // --------------------------------------------------------------------- //
  function renderEndingSoon(items) {
    var region = regionData();
    if (!region) return;
    var now = Date.now();
    var alive = items.filter(function (item) {
      var exp = Number(item.expires_at);
      return exp > 0 && exp * 1000 > now;
    }).sort(function (a, b) { return a.expires_at - b.expires_at; });

    var within24 = alive.filter(function (item) {
      return item.expires_at * 1000 - now <= 24 * 3600 * 1000;
    });
    var list, label;
    if (within24.length) {
      list = within24;
      label = '24 小时内截止 · 手慢无';
    } else if (alive.length) {
      list = alive.slice(0, 8);
      label = '剩余时间最短的 ' + list.length + ' 款 · 临近截止优先看';
    } else {
      els.endingSoon.hidden = true;
      els.endingGrid.innerHTML = '';
      return;
    }
    if (els.endingSub) els.endingSub.textContent = label;
    els.endingSoon.hidden = false;
    els.endingGrid.innerHTML = list.map(function (item, i) {
      var isFree = Number(item.final_price) === 0;
      return '' +
        '<a class="ending-card" href="' + esc(item.store_url) + '" target="_blank" rel="noopener noreferrer" ' +
          'style="animation-delay:' + Math.min(i * 40, 320) + 'ms">' +
          '<img src="' + esc(item.header_image || PLACEHOLDER) + '" alt="" loading="lazy" data-appid="' + esc(item.id) + '" />' +
          '<div class="ending-info">' +
            '<strong>' + esc(item.name) + '</strong>' +
            '<span class="ending-price">' +
              '<em>-' + (item.discount_percent || 0) + '%</em>' +
              '<b>' + (isFree ? '免费' : money(item.final_price, region.symbol)) + '</b>' +
              '<s>' + money(item.original_price, region.symbol) + '</s>' +
            '</span>' +
          '</div>' +
          '<span class="ending-timer" data-expires="' + Number(item.expires_at) + '">' + remaining(item.expires_at).text + '</span>' +
        '</a>';
    }).join('');
    bindImageFallback();
  }

  function render() {
    var region = regionData();
    if (!region) {
      els.grid.innerHTML = '';
      els.resultCount.innerHTML = '数据未能载入，请确认 <code>data/specials.js</code> 存在。';
      return;
    }
    // 若当前区域在数据中不存在，修正按钮状态
    state.region = region.code;
    $$('#regionSwitch button').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.region === region.code);
    });

    var items = region.items || [];
    var visible = getVisible(items);

    renderStats(items, region);
    checkPriceDrops(items);
    renderEndingSoon(items);

    els.resultCount.innerHTML = '共 <strong>' + items.length + '</strong> 款在榜特惠' +
      (visible.length !== items.length ? ' · 当前显示 <strong>' + visible.length + '</strong> 款' : '');

    var stamp = DATA.generated_at_local || DATA.generated_at || '—';
    els.dataNote.textContent = '数据快照：' + stamp + ' · 每日自动更新';
    els.updateTime.textContent = '快照 ' + stamp;
    els.footerUpdated.textContent = '最后更新：' + stamp;

    if (!visible.length) {
      els.grid.innerHTML = '';
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;
    els.grid.innerHTML = visible.map(function (item, i) {
      return cardHTML(item, region, i);
    }).join('');
    bindImageFallback();
  }

  // --------------------------------------------------------------------- //
  // 倒计时刷新
  // --------------------------------------------------------------------- //
  function tickCountdowns() {
    $$('[data-expires]').forEach(function (node) {
      var time = remaining(node.getAttribute('data-expires'));
      node.textContent = time.text;
      node.classList.toggle('urgent', time.cls === 'urgent');
      node.classList.toggle('none', time.cls === 'none');
    });
  }

  // --------------------------------------------------------------------- //
  // 刷新：重新拉取同域 JSON 快照（GitHub Actions 每日更新该文件）
  // --------------------------------------------------------------------- //
  var refreshing = false;
  function refreshData(silent) {
    if (refreshing) return Promise.resolve(false);
    if (location.protocol === 'file:') {
      if (!silent) toast('本地预览模式：显示内置数据快照');
      return Promise.resolve(false);
    }
    refreshing = true;
    if (!silent && els.refresh) els.refresh.classList.add('is-loading');

    return fetch('data/specials.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json || !json.regions) throw new Error('数据格式不正确');
        var changed = !DATA || json.generated_at !== DATA.generated_at;
        DATA = json;
        if (changed) render();
        if (!silent) toast(changed ? '已同步最新数据快照' : '数据已是最新');
        return changed;
      })
      .catch(function () {
        if (!silent) toast('暂未获取到更新，继续显示当前快照');
        return false;
      })
      .then(function (changed) {
        refreshing = false;
        if (els.refresh) els.refresh.classList.remove('is-loading');
        return changed;
      });
  }

  // --------------------------------------------------------------------- //
  // 事件绑定
  // --------------------------------------------------------------------- //
  function bindEvents() {
    els.grid.addEventListener('click', function (e) {
      var btn = e.target.closest('.wish-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var region = regionData();
      var item = ((region && region.items) || []).filter(function (i) {
        return String(i.id) === String(btn.dataset.id);
      })[0];
      if (!item) return;
      toggleWish(item.id, item);
      render();
    });

    els.regionSwitch.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-region]');
      if (!btn) return;
      if (!DATA.regions || !DATA.regions[btn.dataset.region]) {
        toast('该区域暂无数据');
        return;
      }
      state.region = btn.dataset.region;
      render();
    });

    els.chips.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      state.filter = btn.dataset.filter;
      $$('#filterChips button').forEach(function (b) { b.classList.toggle('active', b === btn); });
      render();
    });

    els.sort.addEventListener('change', function () {
      state.sort = els.sort.value;
      render();
    });

    els.search.addEventListener('input', function () {
      state.keyword = els.search.value;
      els.clearSearch.hidden = !state.keyword;
      render();
    });

    els.clearSearch.addEventListener('click', function () {
      els.search.value = '';
      state.keyword = '';
      els.clearSearch.hidden = true;
      els.search.focus();
      render();
    });

    els.reset.addEventListener('click', function () {
      state.keyword = '';
      state.filter = 'all';
      state.sort = 'discount';
      els.search.value = '';
      els.clearSearch.hidden = true;
      els.sort.value = 'discount';
      $$('#filterChips button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.filter === 'all');
      });
      render();
    });

    els.refresh.addEventListener('click', function () { refreshData(false); });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        e.preventDefault();
        els.search.focus();
      }
      if (e.key === 'Escape' && document.activeElement === els.search) {
        els.clearSearch.click();
        els.search.blur();
      }
    });

    // 推断 GitHub 仓库地址（部署在 *.github.io/<repo>/ 时）
    var repoLink = $('#repoLink');
    var host = location.hostname.match(/^([^.]+)\.github\.io$/i);
    var firstSeg = location.pathname.split('/').filter(Boolean)[0];
    if (repoLink) {
      repoLink.href = (host && firstSeg)
        ? 'https://github.com/' + host[1] + '/' + firstSeg
        : 'https://github.com/';
    }
  }

  // --------------------------------------------------------------------- //
  // 启动
  // --------------------------------------------------------------------- //
  function init() {
    bindEvents();
    if (!DATA || !DATA.regions) {
      els.resultCount.textContent = '数据文件缺失：请先运行 python3 scripts/fetch_specials.py';
      els.updateTime.textContent = '数据未载入';
      return;
    }
    render();
    setInterval(tickCountdowns, 1000);
    // 打开页面后静默同步一次，避免浏览器缓存住旧的 specials.js
    refreshData(true);
    // 每 10 分钟静默检查一次数据更新
    setInterval(function () { refreshData(true); }, 10 * 60 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
