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
  months.forEach((m, i) => {
    const h = Math.min(m.late_rate / maxLate, 1) * barH;
    const bar = svg('rect', { x: x(i) - bw / 2, y: barTop + barH - h, width: bw, height: h, fill: css('--missed') });
    bar.append(svg('title', {}, `${m.month} : ${FORMATS.pct(m.late_rate)} en retard, ${FORMATS.n1(m.promised_days)} j annoncés, ${FORMATS.n1(m.actual_days)} j réels`));
    root.append(bar);
    // Étiquette sur les pics seulement, sans chevaucher le mois suivant s'il est plus haut.
    if (m.late_rate >= 0.12 && !(months[i + 1] && months[i + 1].late_rate > m.late_rate)) {
      root.append(svg('text', { class: 'val', x: x(i), y: barTop + barH - h - 4, 'text-anchor': 'middle' }, FORMATS.pct0(m.late_rate)));
    }
    if (i % (W < 520 ? 6 : 3) === 1) {
      const [yy, mm] = m.month.split('-');
      root.append(svg('text', { class: 'axis', x: x(i), y: H - 2, 'text-anchor': 'middle' }, `${MONTHS[+mm - 1].slice(0, 4)}. ${yy.slice(2)}`));
    }
  });

  return [legend([['délai annoncé (jours)', css('--muted'), true], ['délai réel (jours)', css('--ink'), false, true], ['part des commandes en retard', css('--missed')]]), root];
}

function drawPromise(rows, W) {
  const buckets = [...new Set(rows.map(r => r.bucket))];
  const left = 84, right = W < 520 ? 92 : 70, rowH = 22, groupGap = 16;
  const H = buckets.length * (rowH * 2 + groupGap);
  const scale = v => (v / 0.8) * (W - left - right);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` });
  buckets.forEach((b, gi) => {
    const y0 = gi * (rowH * 2 + groupGap);
    root.append(svg('text', { class: 'axis', x: left - 10, y: y0 + rowH + 4, 'text-anchor': 'end' }, b === '31+' ? 'plus de 30 j' : `${b.replace('-', ' à ')} j`));
    [false, true].forEach((late, k) => {
      const r = rows.find(row => row.bucket === b && row.is_late === late);
      if (!r) return;
      const y = y0 + k * rowH;
      root.append(svg('rect', { x: left, y: y + 3, width: scale(r.bad_rate), height: rowH - 6, fill: late ? css('--missed') : css('--kept') }));
      const note = r.orders < 100 ? ` (n = ${r.orders})` : '';
      root.append(svg('text', { class: 'val', x: left + scale(r.bad_rate) + 6, y: y + rowH / 2 + 4 }, FORMATS.pct0(r.bad_rate) + note));
    });
  });
  return [legend([['date annoncée tenue', css('--kept')], ['date annoncée dépassée', css('--missed')]]), root];
}

// Les graphiques sont dessinés à la largeur réelle du conteneur pour garder des textes lisibles
// sur téléphone, puis redessinés si la largeur change.
function renderChart(id, draw, rows) {
  const fig = document.getElementById(id);
  const plot = fig.querySelector('.plot');
  let width = 0;
  const render = () => {
    fig.dataset.state = 'ready';
    const w = Math.max(300, Math.round(plot.clientWidth));
    if (w === width) return;
    width = w;
    plot.replaceChildren(...draw(rows, w));
  };
  render();
  new ResizeObserver(render).observe(plot);
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
    renderChart('chart-monthly', drawMonthly, data.monthly);
    renderChart('chart-promise', drawPromise, data.delay_vs_promise);
    setupRoutes(data.routes);
  })
  .catch(err => fail(`Les données n’ont pas pu être chargées (${err.message}). Le texte de l’étude reste valable ; les graphiques demandent de servir la page en HTTP, par exemple : python3 -m http.server -d site`));
