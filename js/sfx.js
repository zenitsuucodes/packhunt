// 8-bit sound effects synthesised with Web Audio, so there are no audio files to load.
let ctx;
let muted = false;
try { muted = localStorage.getItem('packhunt_muted') === '1'; } catch {}

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const note = (m) => 440 * 2 ** ((m - 69) / 12);

function tone(freq, at, dur, { type = 'square', vol = 0.07, slide = 0 } = {}) {
  const c = ac();
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(at, dur, { vol = 0.2, from = 5000, to = 400, q = 0.8 } = {}) {
  const c = ac();
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const seq = (notes, step, opts) => notes.forEach((m, i) => m && tone(note(m), i * step, step * 1.1, opts));

const play = (fn) => (...args) => { if (muted) return; try { fn(...args); } catch {} };

export const sfx = {
  click: play(() => tone(1200, 0, 0.05, { vol: 0.05 })),
  ping: play(() => { tone(note(88), 0, 0.08, { type: 'triangle', vol: 0.1 }); tone(note(93), 0.09, 0.14, { type: 'triangle', vol: 0.1 }); }),
  appear: play(() => seq([72, 76, 79, 84], 0.07)),
  encounter: play(() => { seq([60, 63, 67, 72, 75, 79, 84], 0.045, { vol: 0.06 }); noise(0, 0.4, { vol: 0.08, from: 800, to: 6000 }); }),
  shake: play(() => { noise(0, 0.12, { vol: 0.25, from: 1800, to: 600, q: 2 }); tone(140, 0, 0.12, { type: 'triangle', vol: 0.18, slide: 0.6 }); }),
  rip: play(() => { noise(0, 0.45, { vol: 0.35, from: 7000, to: 500, q: 0.6 }); tone(220, 0.05, 0.3, { slide: 3, vol: 0.05 }); }),
  hint: play(() => seq([79, 84], 0.08, { type: 'triangle', vol: 0.09 })),
  error: play(() => tone(160, 0, 0.25, { vol: 0.08, slide: 0.7 })),
  reveal: play((rarity) => {
    if (rarity === 'GOLDEN') {
      seq([67, 0, 67, 67, 72, 0, 0, 76, 79, 0, 84], 0.11, { vol: 0.08 });
      seq([55, 0, 55, 55, 60, 0, 0, 64, 67, 0, 72], 0.11, { type: 'triangle', vol: 0.1 });
      for (let i = 0; i < 8; i++) tone(note(96 + (i % 3) * 3), 1.3 + i * 0.06, 0.1, { type: 'triangle', vol: 0.04 });
    } else if (rarity === 'HOLO') {
      seq([72, 76, 79, 84, 88, 91, 96], 0.07);
      for (let i = 0; i < 10; i++) tone(note(100 - (i % 4)), 0.5 + i * 0.05, 0.08, { type: 'triangle', vol: 0.03 });
    } else if (rarity === 'RARE') {
      seq([72, 76, 79, 84, 88], 0.08);
    } else if (rarity === 'UNCOMMON') {
      seq([72, 79, 84], 0.09);
    } else {
      seq([72, 79], 0.1);
    }
  }),
  isMuted: () => muted,
  toggle() {
    muted = !muted;
    try { localStorage.setItem('packhunt_muted', muted ? '1' : '0'); } catch {}
    if (!muted) this.click();
    return muted;
  },
  unlock: () => { try { ac(); } catch {} },
};
