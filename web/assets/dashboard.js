import { api, el, $, clear, when, subscribe } from './api.js';

const state = { layer: location.hash.slice(1) || 'team', me: null, team: null, org: null, channel: null, scan: null };
const view = $('#view');
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);
const KIND_COLOR = { solo: 'var(--solo)', social: 'var(--social)', physical: 'var(--physical)', reflective: 'var(--reflective)' };

// -------------------------------------------------------------- primitives

const metric = (label, value, sub) => el('section', { class: 'card' },
  el('h3', {}, label),
  el('div', { class: 'stat', style: 'margin:12px 0 6px' }, value),
  sub ? el('div', { class: 'tiny faint' }, sub) : null
);

function columnChart(series, { key = 'meaning', height = 120 } = {}) {
  const max = Math.max(1, ...series.map((d) => d[key]));
  return el('div', { style: `display:flex;align-items:flex-end;gap:5px;height:${height}px` },
    series.map((d) => el('div', {
      style: `flex:1;border-radius:4px 4px 0 0;min-height:3px;height:${Math.max(2, (d[key] / max) * 100)}%;` +
        `background:linear-gradient(180deg,var(--amber),rgba(240,164,74,.22))`,
      title: `${d.date} · ${d.meaning} meaning · ${d.social} shared · ${d.people} people`
    }))
  );
}

/** PERMA+4 radar — nine axes, drawn straight rather than pulled from a library. */
function radar(points, size = 260) {
  const c = size / 2;
  const r = c - 44;
  const n = points.length;
  const at = (i, ratio) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * ratio, c + Math.sin(a) * r * ratio];
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size); svg.setAttribute('height', size);

  const add = (tag, attrs, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    svg.append(node);
    return node;
  };

  for (const ring of [0.25, 0.5, 0.75, 1]) {
    add('polygon', {
      points: points.map((_, i) => at(i, ring).join(',')).join(' '),
      fill: 'none', stroke: 'var(--line)', 'stroke-width': 1
    });
  }
  add('polygon', {
    points: points.map((p, i) => at(i, Math.max(0.06, p.score / 100)).join(',')).join(' '),
    fill: 'rgba(240,164,74,.22)', stroke: 'var(--amber)', 'stroke-width': 2, 'stroke-linejoin': 'round'
  });
  points.forEach((p, i) => {
    const [x, y] = at(i, 1.17);
    add('text', {
      x, y, fill: 'var(--ink-faint)', 'font-size': 9.5, 'text-anchor': x < c - 6 ? 'end' : x > c + 6 ? 'start' : 'middle',
      'dominant-baseline': 'middle', 'font-family': 'var(--sans)'
    }, p.block.replace('Positive emotion', 'Positive').replace('Economic security', 'Security').replace('Physical health', 'Physical'));
  });
  return svg;
}

// -------------------------------------------------------------- team layer

function teamView() {
  const t = state.team;
  const avg = t.members.length ? t.balance / t.members.length : 0;

  const nodes = [
    el('div', { class: 'grid g4' },
      metric('Team capital', fmt(t.balance), `${t.members.length} people · ${fmt(avg)} average`),
      metric('Shared rituals', String(t.shared.length), 'moments two or more people held together'),
      metric('Diversification', `${Math.round((t.portfolio?.diversification || 0) * 100)}%`, 'mix of solo, social, physical, reflective'),
      metric('At risk', String(t.atRisk.length), t.atRisk.length ? t.atRisk.map((m) => m.name.split(' ')[0]).join(', ') : 'nobody drifting right now')
    ),

    el('h2', { class: 'section-title' }, 'The agent'),
    el('section', { class: 'card' },
      el('div', { style: 'display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;justify-content:space-between' },
        el('div', { style: 'max-width:56ch' },
          el('h3', {}, 'Scan for a shared cup'),
          el('p', { class: 'muted tiny', style: 'margin:10px 0 0;line-height:1.6' },
            'Kindred looks for two people who are both low at the same time and spends its one message of the day on them. ' +
            'The tea is not the point. The pause is the product.')),
        el('button', { class: 'btn primary', id: 'scan-btn', onclick: runScan }, 'Run the scan')
      ),
      t.teaPair ? el('p', { class: 'tiny faint', style: 'margin:14px 0 0' },
        `Currently drifting: ${t.teaPair.map((p) => `${p.name} (${p.hoursSinceSocial}h since a shared ritual)`).join(' · ')}`) : null,
      state.scan ? el('div', { style: 'margin-top:16px' },
        state.scan.found
          ? el('div', {},
              el('p', { class: 'reframe', style: 'margin:0' }, state.scan.nudge.text),
              el('p', { class: 'tiny faint', style: 'margin:10px 0 0' },
                `${state.scan.delivery.channel === 'slack' ? 'Posted to Slack' : 'Rendered in the in-app #kindred channel'} · ${state.scan.delivery.reason} · ${state.scan.engine} engine · kettle actuated for ${state.scan.pair.map((p) => p.name.split(' ')[0]).join(' and ')}`))
          : el('p', { class: 'muted tiny', style: 'margin:0' }, state.scan.reason)
      ) : null
    ),

    el('h2', { class: 'section-title' }, 'Members'),
    el('section', { class: 'card', style: 'padding:18px 8px' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Person'), el('th', { class: 'num' }, 'Capital'), el('th', { class: 'num' }, 'Streak'),
          el('th', { class: 'num' }, 'This week'), el('th', { class: 'num' }, 'Since shared'), el('th', {}, 'Risk'), el('th', {}, 'Last moment'))),
        el('tbody', {}, t.members.map((m) =>
          el('tr', { class: state.me.user.role === 'judge' ? 'clickable' : '', onclick: () => state.me.user.role === 'judge' && (location.href = `/app#today`) },
            el('td', {}, el('div', { class: 'member' }, el('span', { class: 'av' }, m.avatar), el('span', {}, m.name))),
            el('td', { class: 'num' }, fmt(m.balance)),
            el('td', { class: 'num' }, `${m.streak}d`),
            el('td', { class: 'num' }, String(m.weekCount)),
            el('td', { class: 'num' }, m.hoursSinceSocial >= 999 ? 'never' : `${m.hoursSinceSocial}h`),
            el('td', {}, el('span', { class: `pill ${m.risk}` }, m.risk)),
            el('td', { class: 'muted tiny' }, m.lastMoment ? `${m.lastMoment.label} · ${when(m.lastMoment.at)}` : 'nothing logged')
          )))
      )
    ),

    el('div', { class: 'grid g21', style: 'margin-top:14px' },
      el('section', { class: 'card' },
        el('h3', {}, 'Team meaning · last 14 days'),
        el('div', { style: 'height:16px' }),
        columnChart(t.series),
        el('div', { class: 'legend' },
          el('span', {}, el('i', { style: 'background:var(--amber)' }), 'meaning banked per day'),
          el('span', { class: 'faint' }, 'hover a column for shared-ritual count'))
      ),
      el('section', { class: 'card' },
        el('h3', {}, 'Portfolio'),
        el('div', { style: 'height:14px' }),
        el('div', { class: 'bars' },
          Object.entries(t.portfolio?.weights || {}).map(([kind, w]) =>
            el('div', { class: 'bar-row' },
              el('span', { class: 'muted' }, kind),
              el('div', { class: 'bar' }, el('i', { style: `width:${Math.max(2, w * 100)}%;background:${KIND_COLOR[kind]}` })),
              el('span', { class: 'v' }, `${Math.round(w * 100)}%`))))
      )
    ),

    el('div', { class: 'grid g21', style: 'margin-top:14px' },
      el('section', { class: 'card' },
        el('h3', {}, `#kindred ${state.channel?.slackConnected ? '· live in Slack' : '· in-app channel'}`),
        el('div', { style: 'margin-top:10px' },
          (state.channel?.messages || []).length
            ? state.channel.messages.slice(0, 8).map((m) =>
                el('div', { class: 'msg' },
                  el('span', { style: 'font-size:19px' }, m.kind === 'invite' ? '🍵' : m.kind === 'statement' ? '🧾' : '🪞'),
                  el('div', {},
                    el('div', { class: 'who' }, 'Kindred ',
                      el('span', { class: 'tiny faint', style: 'font-weight:400' },
                        `${m.audience || m.user_name || 'team'} · ${when(m.created_at)} · ${m.engine}`)),
                    el('div', { class: `body ${m.kind === 'invite' ? 'invite' : ''}` }, m.text))))
            : el('p', { class: 'muted tiny' }, 'No team messages yet. Run the scan.'))
      ),
      el('section', { class: 'card' },
        el('h3', {}, 'Shared rituals'),
        el('div', { style: 'margin-top:8px' },
          t.shared.length
            ? t.shared.slice(0, 8).map((s) =>
                el('div', { class: 'entry', style: 'grid-template-columns:1fr auto' },
                  el('div', {}, el('div', {}, s.ritual),
                    el('div', { class: 'meta' }, `${s.date} · ${s.people} people · mood ${s.mood}/5`)),
                  el('span', { class: 'amt' }, `+${s.meaning}`)))
            : el('p', { class: 'muted tiny' }, 'Nothing shared in the last three weeks.'))
      )
    )
  ];
  return nodes;
}

async function runScan() {
  const btn = $('#scan-btn');
  btn.disabled = true; btn.textContent = 'Scanning the team…';
  try {
    state.scan = await api('/api/agent/scan', { method: 'POST', body: { teamId: state.team.team.id } });
    state.channel = await api('/api/channel');
  } finally {
    render();
  }
}

// -------------------------------------------------------- enterprise layer

function orgView() {
  const o = state.org;
  if (o.error) {
    return [el('section', { class: 'card' }, el('h3', {}, 'Enterprise ledger'),
      el('p', { class: 'muted', style: 'margin-top:12px' }, o.hint || 'You do not have access to this layer.'))];
  }
  const perma = state.team?.members?.length
    ? aggregatePerma()
    : [];

  return [
    el('div', { class: 'grid g4' },
      metric('Organisation', String(o.teams.length), `${o.org?.name || ''} · ${o.headcount} people`),
      metric('Avg capital', fmt(o.teams.reduce((a, t) => a + t.avgBalance, 0) / Math.max(1, o.teams.length)), 'per person, decayed over 14 days'),
      metric('Shared rituals', String(o.teams.reduce((a, t) => a + t.sharedRituals, 0)), 'across the whole org, last three weeks'),
      metric('Teams at risk', String(o.teams.filter((t) => t.atRisk > 0).length), 'at least one member drifting')
    ),

    el('h2', { class: 'section-title' }, 'Signal, not surveillance'),
    el('section', { class: 'card' },
      o.signals.length
        ? o.signals.map((s) => el('div', { class: 'signal' },
            el('span', { style: 'font-size:17px' }, '◆'),
            el('div', {}, el('p', {}, s.text),
              el('span', { class: 'tiny faint' }, `cohort of ${s.cohort} · leaders decide what to do with it`))))
        : el('p', { class: 'muted tiny', style: 'margin:0' }, 'Not enough data yet to report anything at this layer.')
    ),
    el('p', { class: 'privacy', style: 'margin-top:14px' }, o.privacy),

    el('h2', { class: 'section-title' }, 'Teams'),
    el('section', { class: 'card', style: 'padding:18px 8px' },
      el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Team'), el('th', { class: 'num' }, 'People'), el('th', { class: 'num' }, 'Avg capital'),
          el('th', { class: 'num' }, 'Shared rituals'), el('th', { class: 'num' }, 'Diversification'),
          el('th', { class: 'num' }, 'Psych-safety proxy'), el('th', { class: 'num' }, 'At risk'))),
        el('tbody', {}, o.teams.map((t) =>
          el('tr', { class: 'clickable', onclick: () => openTeam(t.id) },
            el('td', {}, t.name),
            el('td', { class: 'num' }, String(t.headcount)),
            el('td', { class: 'num' }, fmt(t.avgBalance)),
            el('td', { class: 'num' }, String(t.sharedRituals)),
            el('td', { class: 'num' }, `${Math.round(t.diversification * 100)}%`),
            el('td', { class: 'num' }, String(t.psychSafety)),
            el('td', { class: 'num' }, t.atRisk ? el('span', { class: 'pill elevated' }, String(t.atRisk)) : '0'))))
      )
    ),

    perma.length ? el('div', { class: 'grid g21', style: 'margin-top:14px' },
      el('section', { class: 'card' },
        el('h3', {}, 'Psychological-safety proxy by team'),
        el('div', { style: 'height:16px' }),
        el('div', { class: 'bars' }, o.teams.map((t) =>
          el('div', { class: 'bar-row' },
            el('span', { class: 'muted' }, t.name),
            el('div', { class: 'bar' }, el('i', { style: `width:${t.psychSafety}%;background:var(--tea)` })),
            el('span', { class: 'v' }, String(t.psychSafety))))),
        el('p', { class: 'tiny faint', style: 'margin:14px 0 0;line-height:1.6' },
          'A proxy, clearly labelled as one: shared-ritual density weighted by the mood reported inside those rituals. ' +
          'It is a prompt for a conversation, never an evaluation of a person.')
      ),
      el('section', { class: 'card' },
        el('h3', {}, `PERMA + 4 · ${state.team.team.name}`),
        el('div', { class: 'radar-wrap', style: 'margin-top:10px' }, radar(perma)),
        el('p', { class: 'tiny faint', style: 'margin:6px 0 0' },
          'Operationalised through rituals, not surveys.')
      )
    ) : null
  ];
}

function aggregatePerma() {
  return state.permaCache || [];
}

async function openTeam(id) {
  state.team = await api(`/api/team?team=${id}`);
  state.layer = 'team';
  location.hash = 'team';
  render();
}

/** Pull the QR up mid-demo so a judge can open the phone app on their own device. */
async function setupPairing() {
  let pairing;
  try { pairing = await api('/api/pairing'); } catch { return; }
  if (!pairing.reachable) return;

  const btn = $('#pair-btn');
  btn.hidden = false;
  btn.onclick = () => {
    const pop = el('div', { class: 'pair-pop', onclick: () => pop.remove() },
      el('section', { class: 'card', onclick: (e) => e.stopPropagation() },
        el('h3', {}, 'Open the phone app'),
        el('img', {
          src: '/qr.svg?scale=7&url=' + encodeURIComponent(pairing.appUrl),
          width: 240, height: 240, alt: 'QR code for the Kindred phone app'
        }),
        el('code', { class: 'pair-url' }, pairing.appUrl),
        el('p', { class: 'tiny faint', style: 'margin:14px 0 0' },
          'Same wifi as this laptop. Anything logged on the phone lands here live.'),
        el('button', { class: 'btn', style: 'width:100%;margin-top:14px', onclick: () => pop.remove() }, 'Close')
      )
    );
    document.body.append(pop);
  };
}

// ----------------------------------------------------------------- chrome

function renderTabs() {
  const layers = [{ id: 'team', label: 'Team ledger' }];
  if (state.me.canSeeOrg) layers.push({ id: 'org', label: 'Enterprise ledger' });
  clear($('#layer-tabs')).append(...layers.map((l) =>
    el('button', {
      'aria-selected': String(state.layer === l.id),
      onclick: async () => {
        state.layer = l.id; location.hash = l.id;
        if (l.id === 'org' && !state.org) state.org = await api('/api/org').catch((e) => e.data);
        render();
      }
    }, l.label)
  ));
}

function render() {
  renderTabs();
  clear(view).append(...(state.layer === 'org' ? orgView() : teamView()).filter(Boolean));
}

(async function boot() {
  state.me = await api('/api/me');
  $('#who').textContent =
    `${state.me.user.avatar} ${state.me.user.name} · ${state.me.team?.name || 'no team'} · ${state.me.team?.org_name || ''} · ` +
    `${state.me.engine === 'openai' ? 'GPT brain' : 'local brain'} · ${state.me.slack ? 'Slack connected' : 'in-app #kindred'}`;
  $('#logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; };

  setupPairing();

  const [team, channel, ledger] = await Promise.all([
    api('/api/team'), api('/api/channel'), api('/api/ledger')
  ]);
  state.team = team;
  state.channel = channel;
  state.permaCache = ledger.ledger.perma;
  if (state.layer === 'org' && state.me.canSeeOrg) state.org = await api('/api/org').catch((e) => e.data);
  render();

  subscribe(async (e) => {
    if (e.type === 'nudge' || e.type === 'moment') {
      state.channel = await api('/api/channel');
      state.team = await api(`/api/team?team=${state.team.team.id}`);
      render();
    }
  });
})();
