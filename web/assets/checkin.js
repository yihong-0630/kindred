// The morning conversation.
//
// The first thing Kindred does each day is ask a question and wait. Answers go
// back one at a time, so a half-finished check-in survives a closed tab, and
// the whole thing works by typing if the browser has no microphone.

import { api } from './api.js';
import { canSpeak, canListen, speak, stopSpeaking, armGreeting, listenOnce } from './voice.js';

export const state = {
  loaded: false, day: null, done: false, question: null, step: 1, total: 5,
  thread: [], summary: null, recommendations: [], greeted: false,
  listening: false, partial: '', busy: false, expanded: new Set(), voiceOn: true
};

let onChange = () => {};
export const onCheckinChange = (fn) => { onChange = fn; };
const refresh = () => onChange();

// -------------------------------------------------------------------- load

export async function loadCheckin() {
  const data = await api('/api/checkin/today');
  state.loaded = true;
  state.day = data.day;
  state.done = data.done;
  state.question = data.question;
  state.step = data.step;
  state.total = data.total;
  state.summary = data.summary;
  state.recommendations = data.recommendations || [];
  state.thread = [];
  for (const a of data.answers) {
    state.thread.push({ from: 'kindred', text: a.question });
    state.thread.push({ from: 'me', text: a.answer, modality: a.modality });
  }
  if (state.question) state.thread.push({ from: 'kindred', text: state.question.text, live: true });
  if (state.done && state.summary) state.thread.push({ from: 'kindred', text: state.summary, summary: true });

  // Kindred speaks first, once a day, and only on the opening question.
  if (data.greeting && !state.greeted && state.voiceOn && canSpeak()) {
    state.greeted = true;
    armGreeting(data.greeting);
  }
  return data;
}

/** Is there a conversation waiting? Drives the badge on the tab. */
export const isPending = () => state.loaded && !state.done;

// ------------------------------------------------------------------ answer

export async function sendAnswer(text, modality = 'text') {
  const answer = String(text || '').trim();
  if (!answer || state.busy || !state.question) return;
  state.busy = true;
  stopSpeaking();

  const question = state.question;
  state.thread = state.thread.filter((m) => !m.live);
  state.thread.push({ from: 'kindred', text: question.text });
  state.thread.push({ from: 'me', text: answer, modality });
  state.question = null;
  state.partial = '';
  state.thread.push({ from: 'kindred', typing: true });
  refresh();

  try {
    const out = await api('/api/checkin/answer', {
      method: 'POST',
      body: { questionKey: question.key, question: question.text, answer, modality }
    });
    state.thread = state.thread.filter((m) => !m.typing);

    if (out.done) {
      state.done = true;
      state.summary = out.summary;
      state.recommendations = out.recommendations || [];
      state.thread.push({ from: 'kindred', text: out.summary, summary: true });
      if (state.voiceOn && modality === 'voice') speak(out.summary);
    } else {
      state.question = out.question;
      state.step = out.step;
      state.total = out.total;
      state.thread.push({ from: 'kindred', text: out.question.text, live: true });
      // If they spoke, Kindred speaks back — the conversation keeps its mode.
      if (state.voiceOn && modality === 'voice') speak(out.question.text);
    }
  } catch (err) {
    state.thread = state.thread.filter((m) => !m.typing);
    state.question = question;
    state.thread.push({ from: 'kindred', text: 'That did not save. Say it again?', error: true, live: true });
  } finally {
    state.busy = false;
    refresh();
  }
}

let session = null;

export function toggleListening() {
  if (state.listening) {
    session?.stop();
    return;
  }
  if (!canListen() || !state.question) return;
  stopSpeaking();
  state.listening = true;
  state.partial = '';
  refresh();

  session = listenOnce({
    onPartial: (text) => { state.partial = text; refresh(); },
    onEnd: () => { state.listening = false; refresh(); }
  });
  session.promise.then((text) => {
    state.listening = false;
    const heard = (text || state.partial || '').trim();
    state.partial = '';
    if (heard) sendAnswer(heard, 'voice');
    else refresh();
  });
}

export async function restart() {
  stopSpeaking();
  await api('/api/checkin/restart', { method: 'POST' });
  state.greeted = false;
  state.expanded.clear();
  await loadCheckin();
  refresh();
}

export async function acceptRecommendation(id) {
  const out = await api('/api/recommendations/accept', { method: 'POST', body: { id } });
  const rec = state.recommendations.find((r) => r.recommendation_id === id);
  if (rec) rec.accepted = 1;
  refresh();
  return out;
}
