/**
 * Audio → notes: turns a recording (decoded MP3, WAV…) into a `ParsedMidi` the MIDI importer
 * converts like any MIDI file, and estimates how much of the original survives.
 *
 * Self-contained and dependency-free on purpose, like `midi.ts`: the same file runs in the
 * browser for the SOUND tab's import and in the Naucto-AI service, which checks what its own
 * rendered sounds contain. No model is involved: it is spectral analysis (harmonic summation with
 * iterative subtraction for several simultaneous notes, spectral-flux onsets, a tempo estimate),
 * so it is fast and predictable and loses a lot on dense mixes. The quality figure says how much.
 */
import type { MidiImport, MidiNote, MidiTrack, ParsedMidi } from './midi';

/** Everything is analysed at this rate: enough for pitches and drum colour, cheap to process. */
export const ANALYSIS_RATE = 16000;
const FFT_SIZE = 4096;
/** A short window alongside the long one: onsets and drum colour need time, not frequency. */
const SHORT_SIZE = 512;
const HOP = 256;
/** How late the long window's view of a note ends, and how early it starts, on average. */
const LONG_WINDOW_LAG = 0.06;
const SNAP_AFTER = 0.16;
const SNAP_FRAMES = Math.ceil((SNAP_AFTER * ANALYSIS_RATE) / HOP);
/** Notes this short that begin with another note's start or end are clicks, not notes. */
const CLICK_SECONDS = 0.09;
const HARMONICS = 8;
const HARMONIC_DECAY = 0.8;
const BIN_HZ = ANALYSIS_RATE / FFT_SIZE;
const FRAME_SECONDS = HOP / ANALYSIS_RATE;

export interface TranscribeOptions {
  /** Simultaneous notes looked for per moment, 1–6. */
  voices?: number;
  /** Pitch range, MIDI notes. */
  lowest?: number;
  highest?: number;
  /** Look for drum hits (noisy onsets) and put them on their own track. */
  drums?: boolean;
  /** 0–1: higher keeps quieter notes, and more mistakes with them. */
  sensitivity?: number;
  /** Longer recordings are cut here. */
  maxSeconds?: number;
}

/** What the original recording looked like, kept to score any note list against it. */
export interface AudioAnalysis {
  frames: number;
  duration: number;
  /** Pitch-class energy per frame, `frames × 12`. */
  chroma: Float32Array;
  /** Compressed spectral energy per frame, 0–1. */
  energy: Float32Array;
  /** Linear power per frame: all of it, and the part below 4 kHz (what an 8 kHz sample keeps). */
  power: Float32Array;
  lowPower: Float32Array;
  /** Detected onsets, seconds. */
  onsets: number[];
}

export interface Quality {
  /** Estimated share of the original kept, 0–100. */
  fidelity: number;
  /** 100 − fidelity. */
  loss: number;
  /** Pitch-class similarity over time, 0–100. */
  harmony: number;
  /** Onset agreement, 0–100. */
  rhythm: number;
}

export interface Transcription {
  midi: ParsedMidi;
  analysis: AudioAnalysis;
  /** Score of the raw transcription, before any conversion to chip patterns. */
  quality: Quality;
  truncated: boolean;
}

export interface ScoredNote {
  start: number;
  end: number;
  pitch: number;
  velocity: number;
  drum: boolean;
}

// ---------------------------------------------------------------------------------- signal

/** Mono mix, box-filtered down to the analysis rate, normalised to a peak of 1. */
function prepare(
  channels: readonly Float32Array[],
  rate: number,
  maxSeconds: number,
): { signal: Float32Array; truncated: boolean } {
  const first = channels[0];
  if (!first?.length || !(rate > 0)) {
    throw new Error('No audio to analyse');
  }
  const available = first.length;
  const wanted = Math.min(available, Math.floor(maxSeconds * rate));
  const ratio = rate / ANALYSIS_RATE;
  const length = Math.floor(wanted / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const from = i * ratio,
      to = Math.max(from + 1, (i + 1) * ratio);
    let sum = 0,
      count = 0;
    for (let j = Math.floor(from); j < Math.min(Math.ceil(to), wanted); j++) {
      let mixed = 0;
      for (const channel of channels) {
        mixed += channel[j] ?? 0;
      }
      sum += mixed / channels.length;
      count++;
    }
    out[i] = count ? sum / count : 0;
  }
  let peak = 0;
  for (const value of out) {
    peak = Math.max(peak, Math.abs(value));
  }
  if (peak > 0) {
    for (let i = 0; i < length; i++) {
      out[i] = (out[i] ?? 0) / peak;
    }
  }
  return { signal: out, truncated: wanted < available };
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const num = re.length;
  for (let i = 1, j = 0; i < num; i++) {
    let bit = num >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let size = 2; size <= num; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < num; start += size) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = start + k,
          b = a + size / 2;
        const tr = (re[b] ?? 0) * cr - (im[b] ?? 0) * ci,
          ti = (re[b] ?? 0) * ci + (im[b] ?? 0) * cr;
        re[b] = (re[a] ?? 0) - tr;
        im[b] = (im[a] ?? 0) - ti;
        re[a] = (re[a] ?? 0) + tr;
        im[a] = (im[a] ?? 0) + ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

const frequencyOf = (pitch: number): number => 440 * Math.pow(2, (pitch - 69) / 12);
const pitchClassOf = (pitch: number): number => ((Math.round(pitch) % 12) + 12) % 12;

// ---------------------------------------------------------------------------------- analysis

interface Candidate {
  pitch: number;
  salience: number;
}

interface Frames {
  analysis: AudioAnalysis;
  candidates: Candidate[][];
  flux: Float32Array;
  flatness: Float32Array;
  lowRatio: Float32Array;
  centroid: Float32Array;
}

function analyse(signal: Float32Array, lowest: number, highest: number, voices: number): Frames {
  const frames = Math.max(1, Math.floor(signal.length / HOP));
  const half = FFT_SIZE / 2;
  const window = Float64Array.from(
    { length: FFT_SIZE },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE),
  );
  const norm = FFT_SIZE / 4;
  const pcOfBin = Int8Array.from({ length: half }, (_, k) => {
    const frame2 = k * BIN_HZ;
    return frame2 < 50 || frame2 > 4000 ? -1 : pitchClassOf(69 + 12 * Math.log2(frame2 / 440));
  });
  // Bins each harmonic of each note may fall in: a quarter-tone either side.
  const bands = Array.from({ length: highest - lowest + 1 }, (_, i) => {
    const f0 = frequencyOf(lowest + i);
    const out: [number, number, number][] = [];
    for (let hop = 1; hop <= HARMONICS; hop++) {
      const frame3 = f0 * hop;
      if (frame3 > ANALYSIS_RATE * 0.45) {
        break;
      }
      out.push([
        Math.max(1, Math.floor((frame3 * Math.pow(2, -1 / 24)) / BIN_HZ)),
        Math.min(half - 1, Math.ceil((frame3 * Math.pow(2, 1 / 24)) / BIN_HZ)),
        Math.pow(HARMONIC_DECAY, hop - 1),
      ]);
    }
    return out;
  });

  const chroma = new Float32Array(frames * 12);
  const energy = new Float32Array(frames);
  const power = new Float32Array(frames);
  const lowPower = new Float32Array(frames);
  const flux = new Float32Array(frames);
  const flatness = new Float32Array(frames);
  const lowRatio = new Float32Array(frames);
  const centroid = new Float32Array(frames);
  const candidates: Candidate[][] = [];
  const re = new Float64Array(FFT_SIZE),
    im = new Float64Array(FFT_SIZE);
  const compressed = new Float64Array(half),
    work = new Float64Array(half);
  const shortHalf = SHORT_SIZE / 2,
    shortBin = ANALYSIS_RATE / SHORT_SIZE;
  const shortWindow = Float64Array.from(
    { length: SHORT_SIZE },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SHORT_SIZE),
  );
  const sre = new Float64Array(SHORT_SIZE),
    sim = new Float64Array(SHORT_SIZE),
    shortPrevious = new Float64Array(shortHalf);
  const lowBin = Math.floor(4000 / BIN_HZ);

  for (let frame4 = 0; frame4 < frames; frame4++) {
    const centre = frame4 * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (signal[centre - half + i] ?? 0) * (window[i] ?? 0);
      im[i] = 0;
    }
    fft(re, im);
    let total = 0,
      pw = 0,
      pwLow = 0;
    for (let k = 1; k < half; k++) {
      const magnitude = Math.hypot(re[k] ?? 0, im[k] ?? 0) / norm;
      const code = Math.log1p(100 * magnitude);
      compressed[k] = code;
      total += code;
      const pos = magnitude * magnitude;
      pw += pos;
      if (k < lowBin) {
        pwLow += pos;
      }
      const pc = pcOfBin[k] ?? 0;
      if (pc >= 0) {
        chroma[frame4 * 12 + pc] = (chroma[frame4 * 12 + pc] ?? 0) + code;
      }
    }
    energy[frame4] = total;
    power[frame4] = pw;
    lowPower[frame4] = pwLow;

    // The short window: flux for onsets, and the colour of what starts there.
    for (let i = 0; i < SHORT_SIZE; i++) {
      sre[i] = (signal[centre - shortHalf + i] ?? 0) * (shortWindow[i] ?? 0);
      sim[i] = 0;
    }
    fft(sre, sim);
    let rise = 0,
      logSum = 0,
      linSum = 0,
      weighted = 0,
      low = 0,
      all = 0,
      counted = 0;
    for (let k = 1; k < shortHalf; k++) {
      const magnitude = Math.hypot(sre[k] ?? 0, sim[k] ?? 0) / (SHORT_SIZE / 4);
      const cell = Math.log1p(100 * magnitude);
      rise += Math.max(0, cell - (shortPrevious[k] ?? 0));
      shortPrevious[k] = cell;
      const freq = k * shortBin;
      if (freq >= 100) {
        logSum += Math.log(magnitude + 1e-9);
        linSum += magnitude;
        counted++;
      }
      weighted += freq * magnitude;
      all += magnitude;
      if (freq < 200) {
        low += magnitude;
      }
    }
    flux[frame4] = rise;
    flatness[frame4] = linSum > 0 ? Math.exp(logSum / counted) / (linSum / counted) : 0;
    lowRatio[frame4] = all > 0 ? low / all : 0;
    centroid[frame4] = all > 0 ? weighted / all : 0;

    // Harmonic summation, then subtract the chosen note's expected harmonics and look again.
    work.set(compressed);
    const found: Candidate[] = [];
    for (let val = 0; val < voices + 1; val++) {
      let best = -1,
        bestSalience = 0;
      for (let note2 = 0; note2 < bands.length; note2++) {
        let salience = 0;
        for (const [a, b, width] of bands[note2] ?? []) {
          let peak = 0;
          for (let k = a; k <= b; k++) {
            peak = Math.max(peak, work[k] ?? 0);
          }
          salience += width * peak;
        }
        if (salience > bestSalience) {
          bestSalience = salience;
          best = note2;
        }
      }
      if (best < 0 || bestSalience <= 0) {
        break;
      }
      found.push({ pitch: lowest + best, salience: bestSalience });
      const [fa, fb] = bands[best]?.[0] ?? [0, -1];
      let reference = 0;
      for (let k = fa; k <= fb; k++) {
        reference = Math.max(reference, work[k] ?? 0);
      }
      // Remove what this note is expected to own of each harmonic: its fundamental's level on the
      // usual decay, and at least most of what is there. A note an octave above keeps the excess.
      for (const [a, b, weight2] of bands[best] ?? []) {
        let present = 0;
        for (let k = a; k <= b; k++) {
          present = Math.max(present, work[k] ?? 0);
        }
        const expected = Math.max(reference * weight2, 0.6 * present);
        for (let k = Math.max(1, a - 1); k <= Math.min(half - 1, b + 1); k++) {
          work[k] = Math.max(0, (work[k] ?? 0) - expected);
        }
      }
    }
    candidates.push(found);
  }

  let maxEnergy = 0;
  for (const event of energy) {
    maxEnergy = Math.max(maxEnergy, event);
  }
  if (maxEnergy > 0) {
    for (let frame5 = 0; frame5 < frames; frame5++) {
      energy[frame5] = (energy[frame5] ?? 0) / maxEnergy;
    }
  }
  return {
    analysis: {
      frames,
      duration: frames * FRAME_SECONDS,
      chroma,
      energy,
      power,
      lowPower,
      onsets: onsetsOf(flux).map((frame6) => frame6 * FRAME_SECONDS),
    },
    candidates,
    flux,
    flatness,
    lowRatio,
    centroid,
  };
}

/** Peaks of the spectral flux above a moving median: note and drum starts. */
function onsetsOf(flux: Float32Array): number[] {
  let max = 0;
  for (const value2 of flux) {
    max = Math.max(max, value2);
  }
  if (max <= 0) {
    return [];
  }
  const norm = Float32Array.from(flux, (value3) => value3 / max);
  const out: number[] = [];
  for (let frame7 = 1; frame7 < norm.length - 1; frame7++) {
    const around = Array.from(norm.subarray(Math.max(0, frame7 - 8), frame7 + 9)).sort(
      (a, b) => a - b,
    );
    const median = around[Math.floor(around.length / 2)] ?? 0;
    let peak = true;
    for (
      let gain = Math.max(0, frame7 - 3);
      gain <= Math.min(norm.length - 1, frame7 + 3);
      gain++
    ) {
      if ((norm[gain] ?? 0) > (norm[frame7] ?? 0)) {
        peak = false;
      }
    }
    if (
      peak &&
      (norm[frame7] ?? 0) > median * 1.5 + 0.06 &&
      (!out.length || frame7 - (out[out.length - 1] ?? 0) >= 3)
    ) {
      out.push(frame7);
    }
  }
  return out;
}

/** Tempo from the autocorrelation of the onset strength, favouring the 90–150 BPM region. */
function tempoOf(flux: Float32Array): number {
  const framesPerSecond = 1 / FRAME_SECONDS;
  let bestBpm = 120,
    bestScore = 0;
  for (let bpm = 60; bpm <= 200; bpm++) {
    const lag = (60 * framesPerSecond) / bpm;
    let score = 0;
    for (let frame8 = 0; frame8 + 2 * lag + 1 < flux.length; frame8++) {
      const at = (x: number): number => {
        const i = Math.floor(x);
        return (flux[i] ?? 0) + ((flux[i + 1] ?? 0) - (flux[i] ?? 0)) * (x - i);
      };
      score += (flux[frame8] ?? 0) * (at(frame8 + lag) + 0.5 * at(frame8 + 2 * lag));
    }
    score *= Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}

// ---------------------------------------------------------------------------------- notes

function trackNotes(frames: Frames, sensitivity: number): { notes: MidiNote[]; peak: number } {
  const { candidates } = frames;
  let peak = 0;
  for (const found of candidates) {
    peak = Math.max(peak, found[0]?.salience ?? 0);
  }
  const absolute = peak * (0.28 - 0.2 * sensitivity);
  const byPitch = new Map<number, Float32Array>();
  candidates.forEach((found, frame9) => {
    const first = found[0]?.salience ?? 0;
    if ((frames.analysis.energy[frame9] ?? 0) < 0.02) {
      return;
    }
    for (const { pitch, salience } of found) {
      if (salience < absolute || salience < first * (0.45 - 0.2 * sensitivity)) {
        continue;
      }
      let row = byPitch.get(pitch);
      if (!row) {
        row = new Float32Array(candidates.length);
        byPitch.set(pitch, row);
      }
      row[frame9] = salience;
    }
  });
  const onsetFrames = new Set(
    frames.analysis.onsets.map((tick) => Math.round(tick / FRAME_SECONDS)),
  );
  const notes: MidiNote[] = [];
  const minFrames = 4,
    gap = 2;
  const onsets = frames.analysis.onsets;
  const emit = (pitch: number, row: Float32Array, from: number, to: number): void => {
    if (to - from < minFrames) {
      return;
    }
    let sum = 0;
    for (let frame10 = from; frame10 < to; frame10++) {
      sum += row[frame10] ?? 0;
    }
    const strength = sum / (to - from) / (0.7 * peak);
    // The long window hears a note before it starts and after it stops: take the start from the
    // short window's onset nearby when there is one, and pull both ends in by the window's lag.
    const seen = from * FRAME_SECONDS;
    const expected = seen + LONG_WINDOW_LAG;
    const near = onsets.filter((time2) => time2 >= seen - 0.03 && time2 <= seen + SNAP_AFTER);
    const start = near.length
      ? near.reduce((a, b) => (Math.abs(b - expected) < Math.abs(a - expected) ? b : a))
      : expected;
    const end = Math.max(start + 0.05, to * FRAME_SECONDS - LONG_WINDOW_LAG);
    notes.push({
      start,
      end,
      pitch,
      velocity: Math.max(1, Math.min(127, Math.round(40 + 87 * Math.min(1, strength)))),
      channel: 0,
    });
  };
  for (const [pitch, row] of byPitch) {
    let start = -1,
      last = -1;
    for (let frame11 = 0; frame11 <= row.length; frame11++) {
      const on = frame11 < row.length && (row[frame11] ?? 0) > 0;
      // Onsets within the snapping range belong to this note's own start, not a repeat.
      if (on && start >= 0 && onsetFrames.has(frame11) && frame11 - start > SNAP_FRAMES) {
        // A new attack inside a held pitch is a repeated note, not one long one.
        const before = Math.min(
          ...[1, 2, 3].map((delta) => row[frame11 - delta] ?? 0).filter((value4) => value4 > 0),
        );
        if ((row[frame11] ?? 0) > 1.25 * before) {
          emit(pitch, row, start, last + 1);
          start = frame11;
        }
      }
      if (on) {
        if (start < 0) {
          start = frame11;
        }
        last = frame11;
      } else if (start >= 0 && (frame11 - last > gap || frame11 === row.length)) {
        emit(pitch, row, start, last + 1);
        start = -1;
      }
    }
  }
  // An attack smears into its neighbouring semitones for a frame or two: drop such ghosts, short
  // notes a semitone from a longer, stronger note sounding at the same time.
  const length = (note3: MidiNote): number => note3.end - note3.start;
  const kept = notes.filter(
    (note4) =>
      !notes.some(
        (match) =>
          match !== note4 &&
          Math.abs(match.pitch - note4.pitch) === 1 &&
          match.velocity >= note4.velocity &&
          length(match) >= 2 * length(note4) &&
          Math.min(match.end, note4.end) - Math.max(match.start, note4.start) >=
            0.8 * length(note4),
      ),
  );
  // A hard start or stop is a click, heard as a burst of short low notes. It is where the note
  // really starts or stops — its broadband energy hides the note from the long window meanwhile —
  // so a note following a click begins there, one stopping just before a click ends there, and the
  // click itself is dropped.
  const short = kept.filter((note5) => length(note5) <= CLICK_SECONDS);
  const clicks = new Set<MidiNote>();
  for (const mid of kept) {
    if (length(mid) <= 2 * CLICK_SECONDS) {
      continue;
    }
    const before = short.filter(
      (note6) => mid.start - note6.start >= -0.04 && mid.start - note6.start <= SNAP_AFTER,
    );
    const after = short.filter(
      (note7) => note7.start - mid.end >= -0.04 && note7.start - mid.end <= 0.12,
    );
    // The nearest click on each side: the one before is this note's, earlier ones are not.
    const latest = Math.max(...before.map((note8) => note8.start));
    const earliest = Math.min(...after.map((note9) => note9.start));
    for (const note10 of before) {
      if (note10.start >= latest - 0.02) {
        clicks.add(note10);
      }
    }
    for (const note11 of after) {
      if (note11.start <= earliest + 0.02) {
        clicks.add(note11);
      }
    }
    if (before.length) {
      mid.start = Math.min(mid.start, latest);
    }
    if (after.length) {
      mid.end = Math.max(mid.end, earliest);
    }
  }
  const clean = kept.filter((note12) => !clicks.has(note12));
  return { notes: clean.sort((a, b) => a.start - b.start || a.pitch - b.pitch), peak };
}

/** Noisy onsets become kick, snare or hi-hat hits, told apart by where their energy sits. */
function drumHits(frames: Frames, pitched: MidiNote[]): MidiNote[] {
  const out: MidiNote[] = [];
  let maxFlux = 0;
  for (const value5 of frames.flux) {
    maxFlux = Math.max(maxFlux, value5);
  }
  for (const time3 of frames.analysis.onsets) {
    const frame12 = Math.round(time3 / FRAME_SECONDS);
    const flat = frames.flatness[frame12] ?? 0,
      low = frames.lowRatio[frame12] ?? 0;
    const pitchedStart = pitched.some((note13) => Math.abs(note13.start - time3) < 0.05);
    if (flat < 0.3 && !(low > 0.55 && !pitchedStart)) {
      continue;
    }
    const key = low > 0.45 ? 36 : (frames.centroid[frame12] ?? 0) > 3500 ? 42 : 38;
    const velocity = Math.max(
      30,
      Math.min(127, Math.round((127 * (frames.flux[frame12] ?? 0)) / (maxFlux || 1))),
    );
    out.push({ start: time3, end: time3 + 0.1, pitch: key, velocity, channel: 9 });
  }
  return out;
}

// ---------------------------------------------------------------------------------- scoring

/**
 * How much of a recording a list of notes keeps. Harmony compares pitch classes over time (the
 * notes are "rendered" as harmonic series, so octave slips and timbre are not punished); rhythm
 * compares onsets within 70 ms. An estimate for comparing settings, not a listening test.
 */
export function scoreNotes(analysis: AudioAnalysis, notes: readonly ScoredNote[]): Quality {
  const synth = new Float32Array(analysis.frames * 12);
  for (const note of notes) {
    if (note.drum) {
      continue;
    }
    const from = Math.max(0, Math.floor(note.start / FRAME_SECONDS)),
      to = Math.min(analysis.frames, Math.ceil(note.end / FRAME_SECONDS));
    for (let held2 = 1; held2 <= HARMONICS; held2++) {
      const pc = pitchClassOf(note.pitch + 12 * Math.log2(held2));
      const weight = (note.velocity / 127) * Math.pow(HARMONIC_DECAY, held2 - 1);
      for (let frame13 = from; frame13 < to; frame13++) {
        synth[frame13 * 12 + pc] = (synth[frame13 * 12 + pc] ?? 0) + weight;
      }
    }
  }
  let similar = 0,
    weights = 0;
  for (let frame14 = 0; frame14 < analysis.frames; frame14++) {
    let dot = 0,
      a = 0,
      b = 0;
    for (let k = 0; k < 12; k++) {
      const x = analysis.chroma[frame14 * 12 + k] ?? 0,
        y = synth[frame14 * 12 + k] ?? 0;
      dot += x * y;
      a += x * x;
      b += y * y;
    }
    const loud = analysis.energy[frame14] ?? 0;
    const weight = loud > 0.05 ? loud : b > 0 ? 0.2 : 0;
    if (!weight) {
      continue;
    }
    weights += weight;
    if (a > 0 && b > 0) {
      similar += weight * (dot / Math.sqrt(a * b));
    }
  }
  const harmony = weights ? similar / weights : 1;

  const starts = [...new Set(notes.map((note14) => Math.round((note14.start * 1000) / 30)))]
    .map((value6) => value6 * 0.03)
    .sort((x, y) => x - y);
  const reference = analysis.onsets;
  let matched = 0;
  const used = new Set<number>();
  for (const time4 of reference) {
    const hit = starts.findIndex((span, i) => !used.has(i) && Math.abs(span - time4) <= 0.07);
    if (hit >= 0) {
      used.add(hit);
      matched++;
    }
  }
  const rhythm =
    !reference.length && !starts.length
      ? 1
      : (2 * matched) / (reference.length + starts.length || 1);
  const fidelity = Math.round(100 * (0.65 * harmony + 0.35 * rhythm));
  return {
    fidelity,
    loss: 100 - fidelity,
    harmony: Math.round(100 * harmony),
    rhythm: Math.round(100 * rhythm),
  };
}

/** The notes a chip conversion actually plays, back in seconds, drums told apart by their voice. */
export function notesOfImport(conversion: MidiImport): ScoredNote[] {
  const drums = new Set(conversion.instruments.filter((i) => i.osc === 'noise').map((i) => i.id));
  const byId = new Map(conversion.patterns.map((part2) => [part2.id, part2]));
  const out: ScoredNote[] = [];
  let offset = 0;
  for (const id of conversion.song.sequence) {
    const pattern = byId.get(id);
    if (!pattern) {
      continue;
    }
    const seconds = 60 / (pattern.bpm * pattern.stepsPerBeat);
    for (const note of pattern.notes) {
      const start = offset + note.step * seconds;
      out.push({
        start,
        end: start + note.length * seconds,
        pitch: note.pitch,
        velocity: Math.round(note.volume * 127),
        drum: drums.has(note.instrument),
      });
    }
    offset += pattern.steps * seconds;
  }
  return out;
}

/** How a recording scores once converted to chip patterns: the number the import dialog shows. */
export function scoreImport(analysis: AudioAnalysis, conversion: MidiImport): Quality {
  return scoreNotes(analysis, notesOfImport(conversion));
}

/**
 * What an 8 kHz, 8-bit, one-second sample keeps of a recording: the energy inside its length and
 * below 4 kHz. The 8-bit quantisation costs little on top at these levels and is not modelled.
 */
export function scoreSample(analysis: AudioAnalysis, seconds: number): Quality {
  let total = 0,
    kept = 0;
  for (let frame15 = 0; frame15 < analysis.frames; frame15++) {
    total += analysis.power[frame15] ?? 0;
    if (frame15 * FRAME_SECONDS < seconds) {
      kept += analysis.lowPower[frame15] ?? 0;
    }
  }
  const fidelity = total > 0 ? Math.round((100 * kept) / total) : 100;
  return { fidelity, loss: 100 - fidelity, harmony: fidelity, rhythm: fidelity };
}

// ---------------------------------------------------------------------------------- entry

/**
 * The analysis alone, to score notes or a sample against a sound without transcribing it: short
 * effects and silence have nothing to transcribe but can still be measured.
 */
export function analyseAudio(
  channels: readonly Float32Array[],
  sampleRate: number,
  maxSeconds = 180,
): AudioAnalysis {
  const { signal } = prepare(channels, sampleRate, maxSeconds);
  return analyse(signal, 36, 96, 1).analysis;
}

export function transcribe(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: TranscribeOptions = {},
): Transcription {
  const voices = Math.max(1, Math.min(6, Math.round(options.voices ?? 4)));
  const lowest = Math.max(24, Math.min(100, options.lowest ?? 36));
  const highest = Math.max(lowest + 12, Math.min(108, options.highest ?? 96));
  const sensitivity = Math.max(0, Math.min(1, options.sensitivity ?? 0.5));
  const { signal, truncated } = prepare(channels, sampleRate, options.maxSeconds ?? 180);
  const frames = analyse(signal, lowest, highest, voices);
  const { notes } = trackNotes(frames, sensitivity);
  const bpm = tempoOf(frames.flux);
  // A note shorter than an eighth cannot be written down or played: the editor's grid is 1/8 steps.
  // What is left are the analysis window's own blur, and they read as junk stabs in the roll. Only
  // drop one when it stands alone: a real fast note has a neighbour within an eighth, and length on
  // its own cannot tell them apart, because the long window blurs a genuine sixteenth down to the
  // same 50-100 ms a blur lands in. A tempo-derived floor cannot either — the estimate is off by a
  // third on staccato input, which is exactly the input where notes are shortest.
  const eighth = Math.max(0.06, 30 / bpm);
  const pitched = notes.filter(
    (note15) =>
      note15.end - note15.start >= eighth ||
      notes.some((mag) => mag !== note15 && Math.abs(mag.start - note15.start) < eighth),
  );
  const drums = options.drums === false ? [] : drumHits(frames, pitched);
  const track = (index: number, name: string, list: MidiNote[], channel: number): MidiTrack => ({
    index,
    name,
    notes: list,
    channels: list.length ? [channel] : [],
    program: null,
    percussion: channel === 9 && list.length > 0,
  });
  const tracks = [track(0, 'melody & harmony', pitched, 0), track(1, 'drums', drums, 9)].filter(
    (time5) => time5.notes.length,
  );
  const warnings = [
    'Transcribed from audio: pitches, timing and drums are estimates; timbre, effects and vocals are not kept.',
  ];
  if (truncated) {
    warnings.push(`Only the first ${String(options.maxSeconds ?? 180)} seconds were analysed.`);
  }
  if (!tracks.length) {
    throw new Error('No notes were found in this recording');
  }
  const midi: ParsedMidi = {
    tracks,
    bpm,
    tempoChanges: 0,
    sustained: 0,
    warnings,
    duration: Math.max(...tracks.flatMap((time6) => time6.notes.map((note16) => note16.end))),
  };
  const quality = scoreNotes(
    frames.analysis,
    [...pitched, ...drums].map((note17) => ({ ...note17, drum: note17.channel === 9 })),
  );
  return { midi, analysis: frames.analysis, quality, truncated };
}
