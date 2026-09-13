// Rendering the morning conversation and the actions it produces.

import { el, clear } from './api.js';
import { canListen, canSpeak } from './voice.js';
import * as ck from './checkin.js';

const EVIDENCE_LABEL = {
  rct: 'randomised trial', study: 'study', review: 'review',
  guidance: 'clinical guidance', editorial: 'expert write-up'
};

const KIND_COLOR = { solo: 'var(--solo)', social: 'var(--social)', physical: 'var(--physical)', reflective: 'var(--reflective)' };

// ------------------------------------------------------------------- thread

function bubble(message) {
  if (message.typing) {
    return el('div', { class: 'msg kindred' },
      el('div', { class: 'bubble typing' }, el('i'), el('i'), el('i')));
  }
  return el('div', { class: `msg ${message.from}` },
    el('div', { class: `bubble${message.summary ? ' summary' : ''}${message.error ? ' error' : ''}` },
      message.text,
      message.modality === 'voice' ? el('span', { class: 'by-voice', title: 'Answered by voice' }, ' 🎙') : null
    )
  );
}

function composer(onRender) {
  const s = ck.state;
  if (!s.question) return null;

  const input = el('input', {
    id: 'checkin-input', class: 'checkin-input', autocomplete: 'off',
    placeholder: s.listening ? 'Listening…' : 'Type, or tap the mic',
    value: s.partial, disabled: s.busy || s.listening,
    onkeydown: (e) => { if (e.key === 'Enter') ck.sendAnswer(e.target.value); }
  });

  const chips = s.question.chips?.length
    ? el('div', { class: 'chips' }, s.question.chips.map((c) =>
        el('button', { class: 'chip', disabled: s.busy, onclick: () => ck.sendAnswer(c, 'choice') }, c)))
    : null;

  const mic = canListen()
    ? el('button', {
        class: `mic${s.listening ? ' on' : ''}`, disabled: s.busy,
        title: s.listening ? 'Stop listening' : 'Answer out loud',
        'aria-label': s.listening ? 'Stop listening' : 'Answer out loud',
        onclick: () => ck.toggleListening()
      }, s.listening ? '■' : '🎙')
    : null;

  return el('div', { class: 'composer' },
    chips,
    el('div', { class: 'composer-row' },
      input, mic,
      el('button', {
        class: 'btn primary send', disabled: s.busy,
        onclick: () => ck.sendAnswer(document.getElementById('checkin-input')?.value)
      }, s.busy ? '…' : 'Send')
    ),
    el('div', { class: 'tiny faint', style: 'margin-top:9px' },
      `Question ${Math.min(s.step, s.total)} of ${s.total}`,
      canListen() ? ' · tap the mic to answer out loud' : ' · voice needs Chrome, Edge or Safari')
  );
}

// ------------------------------------------------------------ action cards

function sourceLine(rec) {
  const lead = rec.lead || {
    publisher: rec.source_publisher, url: rec.source_url,
    evidence: rec.evidence, snippet: rec.snippet, title: rec.source_title
  };
  const proof = rec.evidenceSource;

  const link = (src, label) => el('a', {
    class: 'source', href: src.url, target: '_blank', rel: 'noopener noreferrer',
    title: src.snippet || src.title || ''
  }, label);

  return el('div', { class: 'sources' },
    link(lead, `${lead.publisher} ↗`),
    proof
      ? el('span', { class: 'tiny faint' }, ' · evidence: ', link(proof, `${proof.publisher} ${EVIDENCE_LABEL[proof.evidence] || proof.evidence} ↗`))
      : el('span', { class: 'tiny faint' }, ` · ${EVIDENCE_LABEL[lead.evidence] || lead.evidence}`)
  );
}

function actionCard(rec, index) {
  const steps = (() => { try { return JSON.parse(rec.steps || '[]'); } catch { return []; } })();
  const open = ck.state.expanded.has(rec.recommendation_id);
  const taken = rec.accepted === 1;

  const head = el('div', { class: 'action-head' },
    el('span', { class: 'action-n', style: `color:${KIND_COLOR[rec.kind] || 'var(--amber)'}` }, String(index + 1)),
    el('div', {},
      el('div', { class: 'action-title' }, rec.action),
      el('div', { class: 'action-meta' },
        `${rec.minutes} min`,
        rec.kind ? ` · ${rec.kind}` : '',
        rec.tags.includes('grounding') ? ' · grounding' : '')
    )
  );

  const body = el('div', { class: 'action-body' },
    steps.length
      ? el('ol', { class: 'steps' }, steps.map((step) => el('li', {}, step)))
      : null,
    rec.rationale ? el('p', { class: 'why' }, rec.rationale) : null,
    rec.reason ? el('p', { class: 'tiny faint reason' }, rec.reason) : null,
    el('div', { class: 'action-foot' },
      sourceLine(rec),
      taken
        ? el('span', { class: 'pill low' }, '✓ logged')
        : el('button', {
            class: 'btn small',
            onclick: async (e) => {
              e.target.disabled = true;
              e.target.textContent = 'Logging…';
              await ck.acceptRecommendation(rec.recommendation_id);
            }
          }, 'I did this')
    )
  );

  return el('section', { class: `action-card${open ? ' open' : ''}${taken ? ' taken' : ''}` },
    el('button', {
      class: 'action-toggle', 'aria-expanded': String(open),
      onclick: () => {
        const set = ck.state.expanded;
        if (set.has(rec.recommendation_id)) set.delete(rec.recommendation_id);
        else set.add(rec.recommendation_id);
        ck.onCheckinChange && document.dispatchEvent(new CustomEvent('kindred:rerender'));
      }
    }, head, el('span', { class: 'chev' }, open ? '▾' : '▸')),
    open ? body : null
  );
}

// -------------------------------------------------------------------- screen

export function checkinScreen() {
  const s = ck.state;
  if (!s.loaded) return [el('p', { class: 'skeleton' }, 'Opening the conversation…')];

  const nodes = [];

  nodes.push(el('section', { class: 'card checkin-card' },
    el('div', { class: 'checkin-head' },
      el('h3', {}, s.done ? 'This morning’s check-in' : 'Check-in'),
      el('div', { style: 'display:flex;gap:7px;align-items:center' },
        canSpeak()
          ? el('button', {
              class: `pill toggle${s.voiceOn ? ' on' : ''}`,
              title: s.voiceOn ? 'Kindred speaks its questions' : 'Kindred stays silent',
              onclick: () => { s.voiceOn = !s.voiceOn; document.dispatchEvent(new CustomEvent('kindred:rerender')); }
            }, s.voiceOn ? '🔊 voice' : '🔇 muted')
          : null,
        s.done ? el('button', { class: 'pill toggle', onclick: () => ck.restart() }, '↻ again') : null
      )
    ),
    el('div', { class: 'thread', id: 'thread' }, s.thread.map(bubble)),
    composer()
  ));

  if (s.done && s.recommendations.length) {
    nodes.push(el('section', { class: 'card' },
      el('h3', {}, 'What to do about it'),
      el('p', { class: 'muted tiny', style: 'margin:9px 0 4px' },
        'Three actions, picked for what you just said. Tap one to see how to do it.'),
      el('div', { class: 'actions' }, s.recommendations.map(actionCard))
    ));
    nodes.push(el('p', { class: 'tiny faint', style: 'text-align:center;margin:2px 4px 0;line-height:1.7' },
      'Every action links to the research it comes from. Kindred recommends nothing it cannot cite.'));
  }

  return nodes;
}

/** Keep the newest message in view without yanking the page around. */
export function scrollThread() {
  const thread = document.getElementById('thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
  const input = document.getElementById('checkin-input');
  if (input && !ck.state.listening && window.matchMedia('(pointer:fine)').matches) input.focus();
}
