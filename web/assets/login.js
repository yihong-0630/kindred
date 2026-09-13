import { api, $, el } from './api.js';

const next = new URLSearchParams(location.search).get('next');
const go = (user) => { location.href = next || (user.role === 'judge' || user.role === 'lead' ? '/dashboard' : '/app'); };

const DEMO = [
  { email: 'aina@kindred.app',   name: 'Aina Rahman',    avatar: '🌤️', note: 'team lead · 14-day streak' },
  { email: 'daniel@kindred.app', name: 'Daniel Okonkwo', avatar: '🎧', note: 'drifting · elevated risk' },
  { email: 'mei@kindred.app',    name: 'Mei Lin',        avatar: '🌱', note: 'steady practice' },
  { email: 'tomas@kindred.app',  name: 'Tomas Bauer',    avatar: '🪵', note: 'maker · pulled inward' }
];

const tabs = { judge: $('#tab-judge'), member: $('#tab-member') };
const forms = { judge: $('#judge-form'), member: $('#member-form') };

const show = (which) => {
  for (const key of ['judge', 'member']) {
    tabs[key].setAttribute('aria-selected', String(key === which));
    forms[key].hidden = key !== which;
  }
};
tabs.judge.onclick = () => show('judge');
tabs.member.onclick = () => show('member');

$('#accounts').append(...DEMO.map((d) =>
  el('button', {
    class: 'account', type: 'button',
    onclick: () => { $('#email').value = d.email; $('#password').value = 'kindred'; forms.member.requestSubmit(); }
  },
    el('span', {}, d.avatar),
    el('span', {}, el('b', {}, d.name), el('span', { class: 'tiny faint' }, ' — ' + d.note))
  )
));

// Two-device pairing: only shown when this machine actually has a LAN address,
// so it never offers a URL a phone cannot reach.
api('/api/pairing').then(({ appUrl, reachable }) => {
  if (!reachable) return;
  $('#pair-qr').src = '/qr.svg?scale=6&url=' + encodeURIComponent(appUrl);
  $('#pair-url').textContent = appUrl;
  $('#pair').hidden = false;
}).catch(() => { /* pairing is a convenience, never block the login */ });

forms.judge.onsubmit = async (e) => {
  e.preventDefault();
  $('#judge-error').textContent = '';
  try {
    const { user } = await api('/api/auth/judge', { method: 'POST', body: { passcode: $('#passcode').value } });
    go(user);
  } catch {
    $('#judge-error').textContent = 'That passcode is not on the list.';
  }
};

forms.member.onsubmit = async (e) => {
  e.preventDefault();
  $('#member-error').textContent = '';
  try {
    const { user } = await api('/api/auth/login', {
      method: 'POST', body: { email: $('#email').value, password: $('#password').value }
    });
    go(user);
  } catch {
    $('#member-error').textContent = 'Wrong email or password.';
  }
};
