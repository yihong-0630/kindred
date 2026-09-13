import { api, el, $, clear, when, dayName, subscribe } from './api.js';

const TABS = [
  { id: 'today',    ic: '🌤️', label: 'Today' },
  { id: 'ledger',   ic: '📖', label: 'Ledger' },
  { id: 'patterns', ic: '📈', label: 'Patterns' },
  { id: 'room',     ic: '🏠', label: 'Room' }
];

const state = {
  tab: location.hash.slice(1) || 'today',
  me: null, ledger: null, rituals: [], senses: {},
  draft: { ritualKey: null, mood: 4, company: 'alone', note: '' },
  lastReframe: null, statement: null, fired: new Set()
};

const screen = $('#screen');
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);

// ------------------------------------------------------------------ chrome

function renderTabs() {
  clear($('#tabbar')).append(...TABS.map((t) =>
    el('button', {
      'aria-selected': String(state.tab === t.id),
      onclick: () => { state.tab = t.id; location.hash = t.id; render(); }
    }, el('span', { class: 'ic' }, t.ic), t.label)
  ));
}

function toast(text) {
  document.querySelector('.toast')?.remove();
  const node = el('div', { class: 'toast' }, text);
  document.body.append(node);
  setTimeout(() => node.remove(), 5200);
}

// ------------------------------------------------------------------ pieces

const sparkline = (series) => el('div', { class: 'spark' },
  series.map((d) => {
    const max = Math.max(1, ...series.map((x) => x.meaning));
    return el('i', {
      class: d.meaning ? '' : 'zero',
      style: `height:${Math.max(3, (d.meaning / max) * 100)}%`,
      title: `${d.date} · ${d.meaning} meaning · ${d.count} ritual${d.count === 1 ? '' : 's'}`
    });
  })
);

const bars = (rows) => el('div', { class: 'bars' },
  rows.map(({ label, pct, value, color }) =>
    el('div', { class: 'bar-row' },
      el('span', { class: 'muted' }, label),
      el('div', { class: 'bar' }, el('i', { style: `width:${Math.max(2, pct)}%${color ? `;background:${color}` : ''}` })),
      el('span', { class: 'v' }, value)
    )
  )
);

function balanceCard(l) {
  const delta = l.week.meaning - l.prevWeek.meaning;
  return el('section', { class: 'card balance-card' },
    el('h3', {}, 'Happiness capital'),
    el('div', { class: 'stat', style: 'margin:10px 0 6px' }, fmt(l.balance), el('small', {}, ' meaning')),
    el('div', { class: `delta ${delta >= 0 ? 'up' : 'down'}` },
      `${delta >= 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))} vs last week`),
    el('div', { style: 'display:flex;gap:7px;justify-content:center;margin-top:14px;flex-wrap:wrap' },
      el('span', { class: 'pill' }, `${l.interest.streak}-day streak`),
      el('span', { class: 'pill' }, `${l.interest.rate}% interest`),
      el('span', { class: `pill ${l.risk.level}` }, `risk ${l.risk.level}`)
    )
  );
}

// -------------------------------------------------------------- today tab

function todayScreen() {
  const l = state.ledger;
  const nodes = [balanceCard(l)];

  if (state.lastReframe) {
    nodes.push(el('section', { class: 'card' },
      el('h3', {}, `The agent · ${state.lastReframe.engine === 'openai' ? 'GPT' : 'local engine'}`),
      el('p', { class: 'reframe is-new', style: 'margin:12px 0 0' }, state.lastReframe.text)
    ));
  } else if (l.insights[0]) {
    nodes.push(el('section', { class: 'card' },
      el('h3', {}, 'What the agent has noticed'),
      el('p', { class: 'reframe', style: 'margin:12px 0 0' }, l.insights[0].text)
    ));
  }

  // Input → the "one tap, one word, one emoji" half of the Happiness API.
  const grid = el('div', { class: 'ritual-grid' },
    state.rituals.map((r) =>
      el('button', {
        class: 'ritual', 'aria-pressed': String(state.draft.ritualKey === r.key),
        onclick: () => { state.draft.ritualKey = state.draft.ritualKey === r.key ? null : r.key; render(); }
      },
        el('span', { class: 'ic' }, r.icon),
        el('span', { class: 'nm' }, r.label),
        el('span', { class: 'mt' }, `${r.kind} · ${r.sense}`)
      )
    )
  );

  const chosen = state.rituals.find((r) => r.key === state.draft.ritualKey);
  const logCard = el('section', { class: 'card' },
    el('h3', {}, 'Log a ritual'),
    el('div', { style: 'height:12px' }), grid
  );

  if (chosen) {
    logCard.append(
      el('p', { class: 'muted tiny', style: 'margin:14px 0 10px' }, chosen.blurb),
      el('label', { for: 'mood' }, 'How did it land?'),
      el('div', { class: 'mood-row' },
        [1, 2, 3, 4, 5].map((m) =>
          el('button', {
            'aria-pressed': String(state.draft.mood === m),
            title: `${m} / 5`,
            onclick: () => { state.draft.mood = m; render(); }
          }, ['😔', '😕', '😐', '🙂', '😊'][m - 1])
        )
      ),
      el('div', { style: 'height:14px' }),
      el('label', { for: 'company' }, 'Alone or with someone?'),
      el('div', { class: 'mood-row' },
        [['alone', 'Alone'], ['with', 'With someone']].map(([v, txt]) =>
          el('button', {
            style: 'font-size:13px', 'aria-pressed': String(state.draft.company === v),
            onclick: () => { state.draft.company = v; render(); }
          }, txt)
        )
      ),
      el('div', { style: 'height:14px' }),
      el('label', { for: 'note' }, 'One word, if you want'),
      el('input', {
        id: 'note', value: state.draft.note, placeholder: 'rushed, warm, quiet…',
        oninput: (e) => { state.draft.note = e.target.value; }
      }),
      el('div', { style: 'height:14px' }),
      el('button', { class: 'btn primary', style: 'width:100%', id: 'log-btn', onclick: logMoment },
        `Post to the ledger · +${fmt(chosen.base * (0.75 + state.draft.mood / 10) * (state.draft.company === 'with' ? 1.15 : 1))} meaning`)
    );
  }
  nodes.push(logCard);

  nodes.push(el('section', { class: 'card' },
    el('h3', {}, 'Weekly statement'),
    state.statement
      ? el('p', { class: 'reframe', style: 'margin:12px 0 0' }, state.statement)
      : el('p', { class: 'muted tiny', style: 'margin:10px 0 14px' }, 'An audit of what actually made you feel alive this week.'),
    el('button', { class: 'btn', style: 'width:100%;margin-top:12px', onclick: runStatement }, 'Run the audit')
  ));

  return nodes;
}

// ------------------------------------------------------------- ledger tab

function ledgerScreen() {
  const l = state.ledger;
  return [
    el('section', { class: 'card' },
      el('h3', {}, 'Last 14 days'),
      el('div', { style: 'height:14px' }), sparkline(l.series),
      el('div', { class: 'tiny faint', style: 'display:flex;justify-content:space-between;margin-top:8px' },
        el('span', {}, dayName(l.series[0].date)), el('span', {}, 'today'))
    ),
    el('section', { class: 'card' },
      el('h3', {}, `Entries · ${fmt(l.currency)} meaning banked`),
      el('div', { style: 'margin-top:8px' },
        l.moments.length
          ? l.moments.map((m) =>
            el('div', { class: 'entry' },
              el('span', { class: 'ic' }, iconFor(m.ritual_key)),
              el('div', {},
                el('div', {}, m.label),
                el('div', { class: 'meta' },
                  `${when(m.created_at)} · ${m.company === 'with' ? 'with someone' : 'alone'} · mood ${m.mood}/5${m.note ? ` · “${m.note}”` : ''}`),
                m.reframe ? el('div', { class: 'rf' }, m.reframe) : null
              ),
              el('span', { class: 'amt' }, `+${m.meaning.toFixed(2)}`)
            ))
          : el('p', { class: 'muted tiny' }, 'Nothing yet. Log the next ordinary thing you do.')
      )
    )
  ];
}

const iconFor = (key) => state.rituals.find((r) => r.key === key)?.icon || '•';

// ----------------------------------------------------------- patterns tab

function patternsScreen() {
  const l = state.ledger;
  const KIND_COLOR = { solo: 'var(--solo)', social: 'var(--social)', physical: 'var(--physical)', reflective: 'var(--reflective)' };

  return [
    el('section', { class: 'card' },
      el('h3', {}, 'Patterns the agent found'),
      el('div', { style: 'margin-top:10px' },
        l.insights.length
          ? l.insights.map((i) => el('p', { class: 'reframe', style: 'margin:0 0 14px' },
              i.text, el('span', { class: 'tiny faint', style: 'display:block;font-family:var(--sans);margin-top:6px' },
                `${i.pWith}% of days with it vs ${i.pWithout}% without · ${i.sample} days observed`)))
          : el('p', { class: 'muted tiny' }, 'Log a few more days and the patterns start to separate.')
      )
    ),
    el('section', { class: 'card' },
      el('h3', {}, 'Portfolio'),
      el('p', { class: 'muted tiny', style: 'margin:8px 0 14px' },
        `Diversification ${Math.round(l.portfolio.diversification * 100)}%. A practice built on one kind of ritual is fragile.`),
      bars(Object.entries(l.portfolio.weights).map(([kind, w]) => ({
        label: kind, pct: w * 100, value: `${Math.round(w * 100)}%`, color: KIND_COLOR[kind]
      })))
    ),
    el('section', { class: 'card' },
      el('h3', {}, 'Risk'),
      el('div', { style: 'display:flex;align-items:center;gap:10px;margin:12px 0' },
        el('span', { class: `pill ${l.risk.level}` }, l.risk.level),
        el('span', { class: 'tiny faint' }, `score ${l.risk.score.toFixed(2)}`)),
      el('ul', { class: 'muted tiny', style: 'margin:0;padding-left:18px;line-height:1.8' },
        l.risk.drivers.map((d) => el('li', {}, d)))
    ),
    el('section', { class: 'card' },
      el('h3', {}, 'PERMA + 4'),
      el('p', { class: 'muted tiny', style: 'margin:8px 0 14px' },
        'Measured from rituals you actually did, not a survey you filled in.'),
      bars(l.perma.map((p) => ({
        label: p.block,
        pct: p.measured ? p.score : 0,
        value: p.measured ? String(p.score) : '—'
      }))),
      l.perma.some((p) => !p.measured)
        ? el('p', { class: 'tiny faint', style: 'margin:14px 0 0;line-height:1.6' },
            'Blocks marked — have no ritual feeding them yet: ' +
            l.perma.filter((p) => !p.measured).map((p) => p.block.toLowerCase()).join(', ') +
            '. Kindred reports what it can observe rather than inferring the rest.')
        : null
    )
  ];
}

// --------------------------------------------------------------- room tab

function roomScreen() {
  const senses = Object.entries(state.senses);
  const tiles = el('div', { class: 'room', id: 'room-tiles' },
    senses.map(([key, s]) =>
      el('div', { class: `sense-tile${state.fired.has(key) ? ' fire' : ''}`, 'data-sense': key },
        el('span', { class: 'ic' }, s.icon), el('span', { class: 'nm' }, s.label))
    )
  );

  return [
    el('section', { class: 'card' },
      el('h3', {}, 'The room'),
      el('p', { class: 'muted tiny', style: 'margin:8px 0 14px' },
        'Every ritual you post actuates one sensory channel. Remove the room and the product collapses.'),
      tiles,
      el('div', { class: 'tiny faint', style: 'margin-top:12px;line-height:1.7' },
        senses.map(([, s]) => el('div', {}, `${s.icon} ${s.label} — ${s.line} (${s.device})`)))
    ),
    el('section', { class: 'card' },
      el('h3', {}, 'Actuation log'),
      el('div', { id: 'actuations', style: 'margin-top:8px' }, el('p', { class: 'muted tiny' }, 'Loading…'))
    )
  ];
}

async function loadActuations() {
  const node = $('#actuations');
  if (!node) return;
  const { recent } = await api('/api/senses');
  clear(node).append(
    recent.length
      ? el('div', {}, recent.map((a) =>
          el('div', { class: 'entry', style: 'grid-template-columns:34px 1fr auto' },
            el('span', { class: 'ic' }, state.senses[a.sense]?.icon || '•'),
            el('div', {}, el('div', {}, `${a.device} → ${a.action}`),
              el('div', { class: 'meta' }, `${a.name} · ${a.detail || state.senses[a.sense]?.line || ''}`)),
            el('span', { class: 'meta' }, when(a.created_at)))))
      : el('p', { class: 'muted tiny' }, 'The room is quiet. Log a ritual and watch it respond.')
  );
}

// ---------------------------------------------------------------- actions

async function logMoment() {
  const btn = $('#log-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'The agent is reframing…';
  try {
    const out = await api('/api/moments', { method: 'POST', body: state.draft });
    state.ledger = out.ledger;
    state.lastReframe = { text: out.reframe, engine: out.engine };
    state.draft = { ritualKey: null, mood: 4, company: 'alone', note: '' };
    state.tab = 'today';
    if (out.actuation) {
      flashSense(out.actuation.sense);
      toast(`${state.senses[out.actuation.sense]?.icon || ''} ${out.actuation.device} → ${out.actuation.action}`);
    }
    render();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Something went wrong — try again';
  }
}

async function runStatement() {
  const { statement } = await api('/api/statement');
  state.statement = statement;
  render();
}

function flashSense(sense) {
  state.fired.add(sense);
  const tile = document.querySelector(`.sense-tile[data-sense="${sense}"]`);
  tile?.classList.add('fire');
  setTimeout(() => {
    state.fired.delete(sense);
    document.querySelector(`.sense-tile[data-sense="${sense}"]`)?.classList.remove('fire');
  }, 2600);
}

// ----------------------------------------------------------------- render

function render() {
  renderTabs();
  const views = { today: todayScreen, ledger: ledgerScreen, patterns: patternsScreen, room: roomScreen };
  clear(screen).append(...(views[state.tab] || todayScreen)());
  if (state.tab === 'room') loadActuations();
}

(async function boot() {
  const [me, rituals] = await Promise.all([api('/api/me'), api('/api/rituals')]);
  state.me = me;
  state.rituals = rituals.rituals;
  state.senses = rituals.senses;
  $('#engine-pill').textContent = me.engine === 'openai' ? 'GPT brain' : 'local brain';
  $('#engine-pill').title = me.engine === 'openai'
    ? 'Reframes generated by the model'
    : 'No OPENAI_API_KEY set — running the built-in reframe engine';

  const { ledger, viewingSelf } = await api('/api/ledger');
  state.ledger = ledger;
  render();

  if (!viewingSelf) toast(`Judge view — reading ${ledger.user.name}'s personal ledger.`);

  // The room reacting live, including to things other people trigger.
  subscribe((e) => {
    if (e.type === 'actuation') flashSense(e.sense);
    if (e.type === 'nudge' && e.nudge?.scope === 'team') toast(`#kindred · ${e.nudge.text}`);
  });
})();
