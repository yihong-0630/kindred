// Voice, on both sides of the conversation.
//
// Speech synthesis for the greeting, speech recognition for the answers. Both
// are progressive: if the browser has neither, the check-in is a normal chat
// and nothing in the flow breaks.

const synth = window.speechSynthesis;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canSpeak = () => Boolean(synth);
export const canListen = () => Boolean(Recognition);

// Safari populates voices asynchronously and returns an empty list on first ask.
let voicesReady = null;
function voices() {
  if (!synth) return Promise.resolve([]);
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const list = synth.getVoices();
    if (list.length) return resolve(list);
    const onChange = () => { synth.removeEventListener('voiceschanged', onChange); resolve(synth.getVoices()); };
    synth.addEventListener('voiceschanged', onChange);
    setTimeout(() => resolve(synth.getVoices()), 1200);
  });
  return voicesReady;
}

/** Warm over crisp — the greeting should sound like a person, not a station announcement. */
const PREFERRED = [/samantha/i, /serena/i, /allison/i, /ava/i, /google uk english female/i, /karen/i, /moira/i, /daniel/i];

async function pickVoice() {
  const list = await voices();
  const english = list.filter((v) => /^en(-|_|$)/i.test(v.lang));
  for (const pattern of PREFERRED) {
    const hit = english.find((v) => pattern.test(v.name));
    if (hit) return hit;
  }
  return english.find((v) => v.localService) || english[0] || list[0] || null;
}

/**
 * Speak a line. Resolves when it finishes, or immediately if the browser
 * refuses — autoplay policy means the first attempt before any tap may be
 * silently dropped, which `armGreeting` below is there to catch.
 */
export async function speak(text, { rate = 0.92, pitch = 1.04, volume = 0.9 } = {}) {
  if (!synth || !text) return false;
  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = await pickVoice();
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    Object.assign(utterance, { rate, pitch, volume });
    return await new Promise((resolve) => {
      let settled = false;
      const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      utterance.onend = () => done(true);
      utterance.onerror = () => done(false);
      synth.speak(utterance);
      // Some browsers never fire either event when the utterance is blocked.
      setTimeout(() => done(synth.speaking), 600);
    });
  } catch {
    return false;
  }
}

export const stopSpeaking = () => { try { synth?.cancel(); } catch { /* nothing to cancel */ } };

/**
 * Say the line now if the browser allows it; otherwise say it on the very next
 * touch or key the person makes. Either way it is spoken once, not twice.
 */
export function armGreeting(text, opts) {
  let spoken = false;
  const say = async () => {
    if (spoken) return;
    spoken = true;
    detach();
    await speak(text, opts);
  };
  const detach = () => {
    for (const evt of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(evt, say);
  };
  for (const evt of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(evt, say, { once: true, passive: true });

  speak(text, opts).then((ok) => { if (ok) { spoken = true; detach(); } });
  return detach;
}

/**
 * One dictation turn. `onPartial` streams interim text so the person can see
 * they are being heard; the promise resolves with the final transcript.
 */
export function listenOnce({ onPartial, onEnd, lang = 'en-GB' } = {}) {
  if (!Recognition) return { start: () => {}, stop: () => {}, promise: Promise.resolve(null) };

  const recognition = new Recognition();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalText = '';
  const promise = new Promise((resolve) => {
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      onPartial?.((finalText + ' ' + interim).trim());
    };
    recognition.onerror = (event) => { onEnd?.(event.error); resolve(finalText.trim() || null); };
    recognition.onend = () => { onEnd?.(null); resolve(finalText.trim() || null); };
  });

  try { recognition.start(); } catch { /* already running */ }
  return { promise, stop: () => { try { recognition.stop(); } catch { /* already stopped */ } } };
}
