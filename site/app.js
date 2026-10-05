// Remplit les chiffres de l'étude et dessine les graphiques depuis data/results.json.
// Le texte HTML contient déjà les valeurs (lisible sans JavaScript) ; check_numbers.py
// vérifie qu'elles concordent avec le fichier.

const NS = 'http://www.w3.org/2000/svg';
const NBSP = '\u00a0';

function group(intString) {
  return intString.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function fixed(value, digits) {
  const sign = value < 0 ? '−' : '';
  const [int, dec] = Math.abs(value).toFixed(digits).split('.');
  return sign + group(int) + (dec ? ',' + dec : '');
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const FORMATS = {
  int: v => fixed(v, 0),
  n0: v => fixed(v, 0),
  n1: v => fixed(v, 1),
  n2: v => fixed(v, 2),
  pct: v => fixed(v * 100, 1) + NBSP + '%',
  pct0: v => fixed(v * 100, 0) + NBSP + '%',
  pct2: v => fixed(v * 100, 2) + NBSP + '%',
  date: v => {
    const [y, m, d] = v.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  },
};

function lookup(data, path) {
  return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), data);
}

function fillNumbers(data) {
  document.querySelectorAll('[data-k]').forEach(el => {
    const value = lookup(data, el.dataset.k);
    if (value !== undefined) el.textContent = FORMATS[el.dataset.f](value);
  });
}

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
}

function legend(items) {
  const ul = document.createElement('ul');
  ul.className = 'legend';
  items.forEach(([label, color, dashed, isLine]) => {
    const li = document.createElement('li');
    const swatch = document.createElement('i');
    if (isLine || dashed) swatch.className = 'line';
    swatch.style.background = dashed
      ? `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 8px)`
      : color;
    li.append(swatch, label);
    ul.append(li);
  });
  return ul;
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawMonthly(months, W) {
  const H = 330, left = 34, right = 10, top = 10, lineH = 190, gap = 34, barH = 60;
  const x = i => left + (i + 0.5) * (W - left - right) / months.length;
  const maxDays = Math.ceil(Math.max(...months.map(m => m.promised_days)) / 10) * 10;
  const y = v => top + lineH - (v / maxDays) * lineH;
  const maxLate = 0.2;
  const barTop = top + lineH + gap;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` });

  const grid = svg('g', { class: 'grid axis' });
  for (let v = 0; v <= maxDays; v += 10) {
    grid.append(svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v) }));
    grid.append(svg('text', { x: left - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
  }
  grid.append(svg('text', { x: left - 6, y: barTop + 4, 'text-anchor': 'end' }, '20 %'));
  grid.append(svg('line', { x1: left, x2: W - right, y1: barTop + barH, y2: barTop + barH }));
  root.append(grid);

  [['promised_days', css('--muted'), '6 4'], ['actual_days', css('--ink'), '']].forEach(([key, color, dash]) => {
    const d = months.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`).join('');
    root.append(svg('path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash }));
  });

  const bw = (W - left - right) / months.length * 0.62;
  const bars = months.map((m, i) => {
    const h = Math.min(m.late_rate / maxLate, 1) * barH;
    const bar = svg('rect', { x: x(i) - bw / 2, y: barTop + barH - h, width: bw, height: h, fill: css('--missed') });
    root.append(bar);
    // Étiquette sur les pics seulement, sans chevaucher le mois suivant s'il est plus haut.
    if (m.late_rate >= 0.12 && !(months[i + 1] && months[i + 1].late_rate > m.late_rate)) {
      root.append(svg('text', { class: 'val', x: x(i), y: barTop + barH - h - 4, 'text-anchor': 'middle' }, FORMATS.pct0(m.late_rate)));
    }
    if (i % (W < 520 ? 6 : 3) === 1) {
      const [yy, mm] = m.month.split('-');
      root.append(svg('text', { class: 'axis', x: x(i), y: H - 2, 'text-anchor': 'middle' }, `${MONTHS[+mm - 1].slice(0, 4)}. ${yy.slice(2)}`));
    }
    return bar;
  });

  // Mois sélectionné : repère vertical, points sur les deux courbes, barre cerclée.
  const guide = svg('g', { class: 'focus-mark' });
  root.append(guide);
  const mark = i => {
    guide.replaceChildren();
    bars.forEach((bar, k) => bar.classList.toggle('active', k === i));
    if (i < 0) return;
    const m = months[i];
    // Le repère s'arrête au-dessus des barres pour ne pas barrer l'étiquette des pics.
    guide.append(svg('line', { x1: x(i), x2: x(i), y1: top, y2: top + lineH }));
    guide.append(svg('circle', { cx: x(i), cy: y(m.promised_days), r: 4, fill: css('--paper'), stroke: css('--muted'), 'stroke-width': 2 }));
    guide.append(svg('circle', { cx: x(i), cy: y(m.actual_days), r: 4, fill: css('--ink') }));
  };
  const step = (W - left - right) / months.length;
  const pick = px => Math.max(0, Math.min(months.length - 1, Math.floor((px - left) / step)));

  return {
    nodes: [legend([['délai annoncé (jours)', css('--muted'), true], ['délai réel (jours)', css('--ink'), false, true], ['part des commandes en retard', css('--missed')]]), root],
    mark, pick, scrub: true,
  };
}

function monthName(month) {
  const [y, m] = month.split('-');
  const name = MONTHS[+m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

function describeMonth(m) {
  return `${monthName(m.month)} : ${FORMATS.int(m.orders)} commandes livrées, délai annoncé de ${FORMATS.n1(m.promised_days)} jours, délai réel de ${FORMATS.n1(m.actual_days)} jours, ${FORMATS.pct(m.late_rate)} en retard.`;
}

function drawPromise(rows, W) {
  const buckets = [...new Set(rows.map(r => r.bucket))];
  const left = 84, right = W < 520 ? 92 : 70, rowH = 22, groupGap = 16;
  const H = buckets.length * (rowH * 2 + groupGap);
  const scale = v => (v / 0.8) * (W - left - right);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` });
  const bars = [];
  buckets.forEach((b, gi) => {
    const y0 = gi * (rowH * 2 + groupGap);
    root.append(svg('text', { class: 'axis', x: left - 10, y: y0 + rowH + 4, 'text-anchor': 'end' }, bucketLabel(b)));
    [false, true].forEach((late, k) => {
      const r = rows.find(row => row.bucket === b && row.is_late === late);
      if (!r) return;
      const y = y0 + k * rowH;
      const bar = svg('rect', { x: left, y: y + 3, width: scale(r.bad_rate), height: rowH - 6, fill: late ? css('--missed') : css('--kept') });
      bars[rows.indexOf(r)] = { bar, mid: y + rowH / 2 };
      root.append(bar);
      const note = r.orders < 100 ? ` (n = ${r.orders})` : '';
      root.append(svg('text', { class: 'val', x: left + scale(r.bad_rate) + 6, y: y + rowH / 2 + 4 }, FORMATS.pct0(r.bad_rate) + note));
    });
  });
  const mark = i => bars.forEach((b, k) => b.bar.classList.toggle('active', k === i));
  // Au toucher, la barre la plus proche verticalement : les lignes ne font que 22 px.
  const pick = (px, py) => bars.reduce((best, b, k) => (Math.abs(b.mid - py) < Math.abs(bars[best].mid - py) ? k : best), 0);
  return { nodes: [legend([['date annoncée tenue', css('--kept')], ['date annoncée dépassée', css('--missed')]]), root], mark, pick };
}

function bucketLabel(b) {
  return b === '31+' ? 'plus de 30 j' : `${b.replace('-', ' à ')} j`;
}

function describePromise(r) {
  const delay = r.bucket === '31+' ? 'Livré en plus de 30 jours' : `Livré en ${r.bucket.replace('-', ' à ')} jours`;
  return `${delay}, date annoncée ${r.is_late ? 'dépassée' : 'tenue'} : ${FORMATS.pct(r.bad_rate)} d’avis à 1 ou 2 étoiles, sur ${FORMATS.int(r.orders)} commandes avec avis.`;
}

// Les graphiques sont dessinés à la largeur réelle du conteneur pour garder des textes lisibles
// sur téléphone, puis redessinés si la largeur change. Chaque barre ou mois se lit au survol,
// au toucher ou au clavier (flèches) : la valeur exacte s'écrit sous le graphique.
const HINT = 'Survolez ou touchez une barre, ou parcourez-les au clavier avec les flèches, pour lire la valeur exacte et l’effectif.';

function renderChart(id, draw, rows, describe) {
  const fig = document.getElementById(id);
  const plot = fig.querySelector('.plot');
  const readout = document.createElement('p');
  readout.className = 'readout';
  readout.id = `${id}-readout`;
  readout.setAttribute('aria-live', 'polite');
  readout.textContent = HINT;
  plot.after(readout);
  plot.tabIndex = 0;
  plot.setAttribute('aria-describedby', readout.id);

  let width = 0;
  let chart = null;
  let active = -1;
  const select = i => {
    if (i === active) return;
    active = i;
    chart.mark(i);
    readout.textContent = i < 0 ? HINT : describe(rows[i]);
  };
  const render = () => {
    fig.dataset.state = 'ready';
    const w = Math.max(300, Math.round(plot.clientWidth));
    if (w === width) return;
    width = w;
    chart = draw(rows, w);
    plot.replaceChildren(...chart.nodes);
    chart.mark(active);
  };
  const fromPointer = event => {
    const svgEl = plot.querySelector('svg');
    const box = svgEl.getBoundingClientRect();
    const k = width / box.width;
    return chart.pick((event.clientX - box.left) * k, (event.clientY - box.top) * k);
  };
  render();
  new ResizeObserver(render).observe(plot);

  plot.addEventListener('pointerdown', e => { if (e.target.closest('svg')) select(fromPointer(e)); });
  plot.addEventListener('pointermove', e => {
    if (!e.target.closest('svg')) return;
    if (e.pointerType === 'mouse' || chart.scrub) select(fromPointer(e));
  });
  plot.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse' && document.activeElement !== plot) select(-1);
  });
  plot.addEventListener('blur', () => select(-1));
  plot.addEventListener('focus', () => { if (active < 0) select(0); });
  plot.addEventListener('keydown', e => {
    const last = rows.length - 1;
    const next = { ArrowRight: active + 1, ArrowDown: active + 1, ArrowLeft: active - 1, ArrowUp: active - 1, Home: 0, End: last, Escape: -1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(e.key === 'Escape' ? -1 : Math.max(0, Math.min(last, next)));
  });
}

// Figure 3 : la marge ne prend que les valeurs de la grille calculée par analysis.py
// (backtest.margins) ; rien n'est interpolé côté page.
const REFERENCE_MARGIN = 5;

function days(n) {
  return `${n} ${n > 1 ? 'jours' : 'jour'}`;
}

function describeMargin(m, olist) {
  const which = m.margin === REFERENCE_MARGIN
    ? `Avec ${days(m.margin)}, la règle retenue ci-dessus`
    : m.margin === 0 ? 'Sans marge, la date d’Olist telle quelle' : `Avec ${days(m.margin)}, valeur choisie par vous`;
  return `${which} : ${FORMATS.pct0(m.late_avoided_share)} des retards retirés (${FORMATS.pct(m.new_late_rate)} de commandes en retard au lieu de ${FORMATS.pct(olist.olist_late_rate)}), pour un délai annoncé moyen de ${FORMATS.n1(m.new_promise)} jours au lieu de ${FORMATS.n1(olist.olist_promise)}.`;
}

function drawMargins(grid, W, selected) {
  const H = 190, left = 34, right = 10, top = 18, plotH = 140;
  const maxShare = Math.ceil(Math.max(...grid.map(m => m.late_avoided_share)) * 10) / 10;
  const step = (W - left - right) / grid.length;
  const x = i => left + (i + 0.5) * step;
  const y = v => top + plotH - (v / maxShare) * plotH;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` });
  const grid_ = svg('g', { class: 'grid axis' });
  for (let v = 0; v <= maxShare + 1e-9; v += 0.1) {
    grid_.append(svg('line', { x1: left, x2: W - right, y1: y(v), y2: y(v) }));
    grid_.append(svg('text', { x: left - 6, y: y(v) + 4, 'text-anchor': 'end' }, `${Math.round(v * 100)} %`));
  }
  root.append(grid_);
  const bw = step * 0.62;
  grid.forEach((m, i) => {
    const on = m.margin === selected;
    root.append(svg('rect', { class: on ? 'margin-bar active' : 'margin-bar', x: x(i) - bw / 2, y: y(m.late_avoided_share), width: bw, height: plotH - (y(m.late_avoided_share) - top), fill: css('--kept') }));
    root.append(svg('text', { class: on ? 'axis on' : 'axis', x: x(i), y: H - 14, 'text-anchor': 'middle' }, String(m.margin)));
    if (on) root.append(svg('text', { class: 'val', x: x(i), y: y(m.late_avoided_share) - 5, 'text-anchor': 'middle' }, FORMATS.pct0(m.late_avoided_share)));
  });
  root.append(svg('text', { class: 'axis', x: W - right, y: H - 1, 'text-anchor': 'end' }, 'jours de marge'));
  return { root, pick: px => Math.max(0, Math.min(grid.length - 1, Math.floor((px - left) / step))) };
}

function setupMargins(backtest) {
  const fig = document.getElementById('chart-margin');
  const grid = backtest.margins;
  const olist = backtest.policies[1];
  const plot = fig.querySelector('.plot');
  const input = fig.querySelector('#margin');
  const output = fig.querySelector('#margin-value');
  const readout = fig.querySelector('#margin-readout');
  const reset = fig.querySelector('#margin-reset');
  input.min = grid[0].margin;
  input.max = grid[grid.length - 1].margin;
  let width = 0;
  let chart = null;

  const current = () => grid.find(m => m.margin === Number(input.value)) || grid[REFERENCE_MARGIN];
  const draw = () => {
    const m = current();
    chart = drawMargins(grid, width, m.margin);
    plot.replaceChildren(chart.root);
  };
  const update = () => {
    const m = current();
    output.textContent = days(m.margin);
    input.setAttribute('aria-valuetext', days(m.margin));
    readout.textContent = describeMargin(m, olist);
    if (width) draw();
  };
  const resize = () => {
    const w = Math.max(300, Math.round(plot.clientWidth));
    if (w === width) return;
    width = w;
    draw();
  };
  const fromPointer = e => {
    const box = chart.root.getBoundingClientRect();
    input.value = grid[chart.pick((e.clientX - box.left) * width / box.width)].margin;
    update();
  };

  input.addEventListener('input', update);
  reset.addEventListener('click', () => { input.value = REFERENCE_MARGIN; update(); input.focus(); });
  plot.addEventListener('pointerdown', e => { if (e.target.closest('svg')) fromPointer(e); });
  plot.addEventListener('pointermove', e => { if (e.buttons && e.target.closest('svg')) fromPointer(e); });

  fig.dataset.state = 'ready';
  resize();
  new ResizeObserver(resize).observe(plot);
  update();
}

function setupRoutes(routes) {
  const box = document.getElementById('routes');
  const input = box.querySelector('input');
  const tbody = box.querySelector('tbody');
  const buttons = [...box.querySelectorAll('thead button')];
  let key = 'orders';
  let asc = false;

  function render() {
    const q = input.value.trim().toUpperCase();
    const list = routes
      .filter(r => !q || r.route.split(' → ').includes(q))
      .sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (asc ? 1 : -1));
    buttons.forEach(btn => {
      if (btn.dataset.sort === key) btn.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
      else btn.removeAttribute('aria-sort');
    });
    if (!list.length) {
      tbody.innerHTML = `<tr class="empty"><td colspan="6">Aucun trajet avec au moins 30 commandes pour « ${q.replace(/[^A-Z]/g, '')} ». Les codes sont ceux des États brésiliens : SP, RJ, MG…</td></tr>`;
      return;
    }
    tbody.replaceChildren(...list.map(r => {
      const tr = document.createElement('tr');
      if (r.late_rate >= 0.12) tr.className = 'hot';
      [r.route, FORMATS.int(r.orders), FORMATS.n0(r.promised), FORMATS.n0(r.actual), FORMATS.pct(r.late_rate), FORMATS.pct(r.bad_rate)]
        .forEach((v, i) => {
          const cell = document.createElement(i ? 'td' : 'th');
          if (!i) cell.scope = 'row';
          cell.textContent = v;
          tr.append(cell);
        });
      return tr;
    }));
  }

  buttons.forEach(btn => btn.addEventListener('click', () => {
    asc = btn.dataset.sort === key ? !asc : btn.dataset.sort === 'route';
    key = btn.dataset.sort;
    render();
  }));
  input.addEventListener('input', render);
  render();
  box.dataset.state = 'ready';
}

function fail(message) {
  document.querySelectorAll('[data-state="loading"]').forEach(el => {
    el.dataset.state = 'error';
    el.querySelector('.state').textContent = message;
  });
}

fetch('data/results.json')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(data => {
    fillNumbers(data);
    renderChart('chart-monthly', drawMonthly, data.monthly, describeMonth);
    renderChart('chart-promise', drawPromise, data.delay_vs_promise, describePromise);
    setupMargins(data.backtest);
    setupRoutes(data.routes);
  })
  .catch(err => fail(`Les données n’ont pas pu être chargées (${err.message}). Le texte de l’étude reste valable ; les graphiques demandent de servir la page en HTTP, par exemple : python3 -m http.server -d site`));
