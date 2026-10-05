#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_audio.py — deterministic military sound design for «درع الوطن» (67.000 s, 48 kHz).

No song, no melody, no harmony, no vocals: everything here is synthesized SFX and percussion.

Outputs (each exactly 67.000 s = 3 216 000 frames, 48 kHz, stereo, 16-bit PCM):
  audio/sfx.wav           SFX stem: every cue of BRIEF.md + a subtle wind / drone ambience bed
  audio/drums.wav         military percussion stem: war drums (taiko/odaiko), field snare + rolls, toms, low booms
  audio/mix_sfx_only.wav  mastered SFX stem alone (literally no music)
  audio/mix_full.wav      mastered SFX + drums
The two stems share one gain, so sfx.wav + drums.wav == the un-mastered full mix.

Run:   python3 audio/build_audio.py           (≈1 min; all randomness comes from fixed seeds)
Check: python3 audio/check_audio.py           (durations, onset table vs cue sheet, loudness, PNGs)

Synthesis notes
  * every hit is layered: sub thump with pitch drop + mid body + filtered-noise transient + rumble tail,
    then sent to convolution reverbs built from synthetic, exponentially-decaying stereo IRs
    (hall, long "desert" IR with dune slap-back echoes, short drum room);
  * noise is always shaped with Butterworth SOS filters; all envelopes have short attack/release ramps;
  * jets = noise whose spectral centre follows the Doppler factor of a straight-line flyby
    (time-varying Gaussian weighting of a ¼-octave filter bank) + turbine whine + crackle + low rumble,
    panned along the flight path, 1/r amplitude, air absorption on the highs.
  * pre-hit "suck": everything but the hero hits dips for ~0.1 s before 14.4 / 56.4 / 60.0;
  * mastering: 30 Hz high-pass → sub-band (<110 Hz) soft clip → gentle stereo-linked bus compressor (2:1, ~3 dB)
    → look-ahead true-peak limiter (4× oversampled detection) → DC blocker → loudness iterated (secant) to
    −14 LUFS (BS.1770-4, own implementation; verified with ffmpeg ebur128/loudnorm) → fade → TPDF dither.
  * drums: silent before 6.0 and under «بإذن الله» (62.4–64.2); the 64.2 / 66.0 coda hits bypass that mute.
"""
import os
import time

import numpy as np
import scipy.signal as ss
from scipy.io import wavfile

SR = 48000
DUR = 67.0
N = int(round(SR * DUR))            # 3 216 000 frames
NT = N + 6 * SR                     # working length (room for tails, cropped at the end)
BEAT, BAR, GRID0 = 0.6, 2.4, 6.0    # 100 BPM grid, bar 0 starts at 6.0 s
FADE_OUT = (66.30, 66.98)           # master fade → exact digital silence for the last 20 ms
OUT = os.path.dirname(os.path.abspath(__file__))
TARGET_LUFS = -14.0
TP_CEIL = -1.5                      # internal limiter ceiling (dBTP); the deliverable spec is ≤ −1 dBTP
DRUM_DB = -5.0                      # drum stem level relative to the SFX stem

# --------------------------------------------------------------------------------------------- cue sheet
# Transient cues (checked by onset detection, ±20 ms).
HIT_CUES = [
    (0.6, 'S1 radar ping 1'), (1.8, 'S1 radar ping 2'), (3.0, 'S1 radar ping 3'),
    (6.0, 'S2 HIT flag reveal'), (6.6, 'S2 metal slam (title)'), (8.4, 'S2 sword shing'),
    (10.2, 'S2 hit «عزمٌ لا يلين»'),
    (14.4, 'S3 jet flyby peak (shake thump)'), (15.0, 'S3 hit lower-third'),
    (16.2, 'S3 accent «صقور السماء» (extra)'), (18.6, 'S3 afterburner boom'),
    (20.4, 'S3 lock beeps start'), (21.6, 'S3 LOCK steady tone'), (22.2, 'S3 missile launch'),
    (25.2, 'S4 hit «القوات البرية»'), (27.0, 'S4 tank cannon BOOM 1'), (30.6, 'S4 tank cannon BOOM 2'),
    (31.8, 'S4 hit «أرضٌ لا تُمَسّ»'),
    (34.2, 'S5 glitch title'), (36.0, 'S5 blip 1'), (37.2, 'S5 blip 2'), (38.4, 'S5 blip 3'), (39.6, 'S5 blip 4'),
    (40.8, 'S5 lock tone + hit (verdict)'),
    (42.0, 'S6 day 1 hit'), (44.4, 'S6 day 2 hit'), (46.8, 'S6 day 3 hit'), (49.2, 'S6 day 4 hit'),
    (51.6, 'S6 day 5 hit'), (54.0, 'S6 day 6 hit'), (56.4, 'S6 day 7 HUGE hit'),
    (60.0, 'S7 HUGE HIT «النصر قادم»'), (61.2, 'S7 hit «خلال ٧ أيام»'), (64.2, 'S7 soft hit «حفظ الله الوطن»'),
    (66.0, 'S7 final boom'),
]
# Gradual cues (checked on an isolated render): (tag, label, start, peak_lo, peak_hi, quiet_by)
GRADUAL_CUES = [
    ('ticks', 'S1 data ticks 1.2–2.6', 1.2, None, None, 2.65),
    ('riser1', 'S1 riser 4.2→5.8', 4.2, 5.70, 5.83, 6.0),
    ('whoosh1', 'S2 whoosh 11.4 (whip-pan up)', 11.4, 11.55, 11.95, 12.25),
    ('jet1', 'S3 jet flyby 12.0–15.0, peak 14.4', 12.0, 14.30, 14.55, None),
    ('ab', 'S3 afterburner 17.4–20.4, boom 18.6', 17.4, 18.55, 18.95, 20.75),
    ('whoosh2', 'S3 whoosh 23.4 (jet passes camera)', 23.4, 23.55, 23.85, 24.7),
    ('rotor', 'S4 rotor thump 28.2–31.8', 28.2, 29.3, 30.9, 31.85),
    ('whoosh3', 'S4 whoosh 33.6 (dust cloud)', 33.6, 33.70, 33.98, 34.3),
    ('riser2', 'S5 riser 41.4→42.0', 41.4, 41.85, 42.01, 42.15),
    ('riser3', 'S6 whoosh/riser 58.2→58.8', 58.2, 58.65, 58.81, 59.0),
    ('jet7', 'S7 formation flyby 59.4', 59.4, 59.65, 60.1, 62.4),
    ('swell', 'S7 low swell 62.4 (no hit)', 62.4, 62.9, 63.7, 64.8),
]


# ============================================================================================ DSP helpers
def ns(sec):
    return int(round(sec * SR))


def tv(n):
    return np.arange(n) / SR


def rng(seed):
    return np.random.default_rng(seed)


def white(n, seed):
    return rng(seed).standard_normal(n)


def st_noise(n, seed, corr=0.0):
    """Stereo Gaussian noise with inter-channel correlation `corr`."""
    r = rng(seed)
    a = r.standard_normal(n)
    b = r.standard_normal(n)
    return np.stack([a, corr * a + np.sqrt(1.0 - corr * corr) * b], axis=1)


_SOS = {}


def _sos(kind, f, order):
    key = (kind, f, order)
    s = _SOS.get(key)
    if s is None:
        s = ss.butter(order, f, btype=kind, fs=SR, output='sos')
        _SOS[key] = s
    return s


def lp(x, f, order=2):
    return ss.sosfilt(_sos('lowpass', float(f), order), x, axis=0)


def hp(x, f, order=2):
    return ss.sosfilt(_sos('highpass', float(f), order), x, axis=0)


def bp(x, lo, hi, order=2):
    return ss.sosfilt(_sos('bandpass', (float(lo), float(min(hi, 0.45 * SR))), order), x, axis=0)


def rms(x):
    return float(np.sqrt(np.mean(np.square(x)) + 1e-24))


def unit(x):
    return x / rms(x)


def ramp_in(n, att):
    """Raised-cosine 0→1 over `att` seconds, then 1."""
    w = np.ones(n)
    k = min(n, max(1, ns(att)))
    w[:k] = 0.5 - 0.5 * np.cos(np.pi * np.arange(k) / k)
    return w


def env(n, att=0.002, tau=0.2, hold=0.0):
    """Attack ramp + optional hold + exponential decay (time constant tau)."""
    t = tv(n)
    return ramp_in(n, att) * np.exp(-np.maximum(t - att - hold, 0.0) / tau)


def fade(x, fin=0.0005, fout=0.006):
    n = len(x)
    w = np.ones(n)
    ki, ko = min(n, ns(fin)), min(n, ns(fout))
    if ki > 0:
        w[:ki] = 0.5 - 0.5 * np.cos(np.pi * np.arange(ki) / ki)
    if ko > 0:
        w[n - ko:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(1, ko + 1) / ko)
    return x * (w[:, None] if x.ndim == 2 else w)


def osc(freq, ph0=0.0):
    """Sine with an arbitrary instantaneous-frequency curve (Hz array)."""
    return np.sin(ph0 + 2 * np.pi * np.cumsum(np.asarray(freq, float)) / SR)


def pan2(x, p):
    """Constant-power pan; p in [-1, 1], scalar or per-sample array."""
    a = (np.clip(p, -1, 1) + 1.0) * (np.pi / 4)
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def mono2(x):
    return np.stack([x, x], axis=1) * 0.70710678


def sstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def sat(x, drive):
    return np.tanh(drive * x) / np.tanh(drive)


def smooth_rand(n, rate, seed):
    """Smooth random control signal in [-1, 1] (cosine-interpolated random points at `rate` Hz)."""
    k = int(np.ceil(n / SR * rate)) + 3
    pts = rng(seed).uniform(-1, 1, k)
    pos = np.arange(n) / SR * rate
    i = pos.astype(int)
    f = pos - i
    w = 0.5 - 0.5 * np.cos(np.pi * f)
    return pts[i] * (1 - w) + pts[i + 1] * w


def delay(x, sec):
    k = ns(sec)
    out = np.zeros_like(x)
    if k < len(x):
        out[k:] = x[:len(x) - k]
    return out


def add_at(dst, src, i, gain=1.0):
    """dst[i:i+len(src)] += gain*src (clipped to dst length); src mono→stereo centred if needed."""
    if src.ndim == 1 and dst.ndim == 2:
        src = mono2(src)
    j = min(len(dst), i + len(src))
    if j > i:
        dst[i:j] += gain * src[:j - i]
    return dst


_BANK = 32.0 * 2.0 ** (np.arange(0, 40) / 4.0)
_BANK = _BANK[_BANK * 2 ** 0.125 < 0.45 * SR]


def swept_noise(n, fc, sigma=0.5, seed=0, stereo=False, corr=0.0):
    """Noise whose spectral peak follows fc(t): Gaussian weighting (in octaves, std `sigma`) of a ¼-octave
    Butterworth band-pass bank. Output has ≈unit RMS independent of fc; smooth, click-free sweeps."""
    fc = np.broadcast_to(np.asarray(fc, float), (n,))
    lf = np.log2(np.clip(fc, 20.0, 20000.0))
    lo, hi = lf.min() - 3 * sigma, lf.max() + 3 * sigma
    src = st_noise(n, seed, corr) if stereo else white(n, seed)
    out = np.zeros_like(src)
    norm = np.zeros(n)
    for f in _BANK:
        l2 = np.log2(f)
        if l2 < lo or l2 > hi:
            continue
        w = np.exp(-0.5 * ((l2 - lf) / sigma) ** 2)
        band = bp(src, f * 2 ** -0.125, f * 2 ** 0.125, 2)
        band = band / np.sqrt(2 * f * (2 ** 0.125 - 2 ** -0.125) / SR)
        out += band * (w[:, None] if stereo else w)
        norm += w * w
    norm = np.sqrt(np.maximum(norm, 1e-4))
    return out / (norm[:, None] if stereo else norm)


def crackle(n, rate, seed, hp_f=1200.0):
    """Sparse impulsive crackle (jet / rocket exhaust). rate = events per second (scalar or array)."""
    r = rng(seed)
    rate = np.broadcast_to(np.asarray(rate, float), (n,))
    hits = r.random(n) < rate / SR
    amps = np.zeros(n)
    idx = np.nonzero(hits)[0]
    amps[idx] = r.uniform(0.3, 1.0, len(idx)) * r.choice([-1.0, 1.0], len(idx))
    kn = ns(0.004)
    k = hp(white(kn, seed + 1), hp_f) * np.exp(-tv(kn) / 0.0007)
    k /= np.max(np.abs(k)) + 1e-9
    return ss.oaconvolve(amps, k)[:n]


# ============================================================================================ reverbs
def make_ir(length, rt_low, rt_mid, rt_high, predelay, seed, lp_f=9000.0, corr=0.0, early=(), echo_lp=2500.0,
            tail_gain=1.0):
    """Synthetic stereo IR: decorrelated noise, 3-band exponential decay (frequency-dependent RT60),
    soft onset, optional discrete early reflections / slap-back echoes; unit energy per channel."""
    n = ns(length)
    t = tv(n)
    nz = st_noise(n, seed, corr)
    ir = (lp(nz, 350) * np.exp(-6.91 * t / rt_low)[:, None]
          + bp(nz, 350, 3000) * np.exp(-6.91 * t / rt_mid)[:, None]
          + hp(nz, 3000) * np.exp(-6.91 * t / rt_high)[:, None])
    ir = lp(ir, lp_f)
    ir *= ramp_in(n, 0.015)[:, None]
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    ir *= tail_gain
    for k, (dt, g, pan) in enumerate(early):
        m = ns(0.03)
        burst = lp(white(m, seed + 100 + k), echo_lp / (1 + 0.4 * k)) * np.exp(-tv(m) / 0.008)
        burst /= np.sqrt(np.sum(burst ** 2))
        add_at(ir, pan2(burst, pan) * 1.41421356, ns(dt), g)
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    return np.vstack([np.zeros((ns(predelay), 2)), ir])


_IRS = {}


def irs():
    if not _IRS:
        _IRS['hall'] = make_ir(4.0, 2.2, 2.4, 1.1, 0.022, 7001, lp_f=8000, corr=0.1,
                               early=((0.013, 0.5, -0.6), (0.021, 0.4, 0.7), (0.034, 0.3, -0.2)))
        _IRS['desert'] = make_ir(5.5, 3.6, 2.6, 0.8, 0.03, 7002, lp_f=3200, corr=0.2, tail_gain=0.8,
                                 early=((0.31, 0.62, -0.6), (0.62, 0.48, 0.7), (0.98, 0.36, -0.3),
                                        (1.44, 0.25, 0.55), (1.95, 0.16, -0.7), (2.6, 0.09, 0.4)), echo_lp=1800)
        _IRS['room'] = make_ir(1.4, 0.8, 0.85, 0.4, 0.007, 7003, lp_f=10000, corr=0.05,
                               early=((0.009, 0.6, -0.5), (0.014, 0.5, 0.6), (0.023, 0.35, 0.1)))
    return _IRS


def convolve_bus(x, ir):
    out = np.empty_like(x)
    for c in range(2):
        out[:, c] = ss.oaconvolve(x[:, c], ir[:, c])[:len(x)]
    return out


class Mixer:
    def __init__(self, sends=('hall', 'desert', 'room')):
        self.dry = np.zeros((NT, 2))
        self.send = {k: np.zeros((NT, 2)) for k in sends}

    def add(self, sig, t, gain=1.0, pan=0.0, **sends):
        if sig.ndim == 1:
            sig = pan2(sig, pan)
        i = ns(t)
        add_at(self.dry, sig, i, gain)
        for k, g in sends.items():
            if g:
                add_at(self.send[k], sig, i, gain * g)

    SEND_HP = {'hall': 160.0, 'room': 140.0, 'desert': 80.0}

    def render(self):
        out = self.dry.copy()
        for k, b in self.send.items():
            if np.any(b):
                out += convolve_bus(hp(b, self.SEND_HP[k], 2), irs()[k])
        return out


# ============================================================================================ SFX generators
def impact(size=1.0, seed=0, sub_hi=105.0, sub_lo=36.0, crack=1.0, body=1.0, tail=1.0, sizzle=1.0, dur=None):
    """Layered cinematic hit. Onset (attack start) is at sample 0."""
    s = size
    dur = dur or (0.9 + 2.3 * s)
    n = ns(dur)
    t = tv(n)
    f = sub_lo + (sub_hi - sub_lo) * np.exp(-t / (0.04 + 0.04 * s))                 # sub with pitch drop
    sub = sat(osc(f) * env(n, 0.0015, 0.16 + 0.42 * s), 1.8)
    fb = 72 + 165 * np.exp(-t / 0.018)                                               # punchy mid body
    tone = osc(fb) * env(n, 0.001, 0.05 + 0.06 * s)
    nb = unit(bp(white(n, seed + 1), 140, 1500)) * env(n, 0.0008, 0.045 + 0.07 * s)
    nc = unit(bp(st_noise(n, seed + 2, 0.5), 1500, 11000)) * env(n, 0.0003, 0.006 + 0.012 * s)[:, None]  # crack
    nr = unit(lp(st_noise(n, seed + 3, 0.3), 170)) * env(n, 0.012, 0.3 + 0.9 * s)[:, None]               # rumble
    nz = unit(bp(st_noise(n, seed + 4, 0.1), 2500, 9500)) * env(n, 0.004, 0.1 + 0.3 * s)[:, None]        # debris
    mono = sat(0.75 * sub + body * (0.42 * tone + 0.24 * nb), 1.4)
    out = mono2(mono) + 0.26 * crack * nc + 0.12 * tail * nr + 0.04 * sizzle * nz
    return fade(out, 0.0, 0.01)


def metal_ring(dur, seed, f0=420.0, decay=1.2, mono=False):
    """Inharmonic struck-steel resonance (free-bar + random plate modes), detuned L/R pairs → slow beating."""
    n = ns(dur)
    t = tv(n)
    r = rng(seed)
    ratios = [1.0, 2.756, 5.404, 8.933, 13.34, 18.64] + list(r.uniform(1.3, 16.0, 6))
    out = np.zeros((n, 2))
    for i, q in enumerate(ratios):
        f = f0 * q
        if f > 14000:
            continue
        a = (1.0 / (1 + 0.5 * i)) * (0.6 if i >= 6 else 1.0)
        tau = decay / (1 + 0.18 * q)
        det = r.uniform(0.8, 3.0)
        e = env(n, 0.0006, tau)
        out[:, 0] += a * osc(np.full(n, f - det / 2), r.uniform(0, 2 * np.pi)) * e
        out[:, 1] += a * osc(np.full(n, f + det / 2), r.uniform(0, 2 * np.pi)) * e
    out /= np.max(np.abs(out)) + 1e-9
    out = fade(out, 0.0, 0.02)
    return out.mean(axis=1) if mono else out


def text_hit(size, seed, metal=0.12, f0=520.0):
    out = impact(size, seed)
    add_at(out, metal_ring(min(2.0, len(out) / SR), seed + 30, f0=f0, decay=0.9), 0, metal)
    return out


def huge_impact(size, seed):
    out = impact(size, seed, sub_hi=95, sub_lo=31, crack=1.25, tail=1.4, sizzle=1.5)
    n = len(out)
    t = tv(n)
    sub2 = osc(26 + 34 * np.exp(-t / 0.35)) * env(n, 0.004, 1.0) * 0.42                  # second, deeper drop
    push = swept_noise(n, 120 + 1000 * np.exp(-t / 0.25), 0.8, seed + 60, stereo=True, corr=0.3)
    push *= env(n, 0.006, 0.45)[:, None] * 0.07                                          # air push
    out += mono2(sub2) + push
    add_at(out, metal_ring(3.0, seed + 61, f0=300, decay=1.6), 0, 0.16)
    return fade(out, 0.0, 0.05)


def metal_slam(seed):
    out = impact(0.85, seed, crack=1.3)
    add_at(out, metal_ring(2.6, seed + 7, f0=380, decay=1.3), 0, 0.30)
    add_at(out, metal_ring(1.2, seed + 8, f0=690, decay=0.45), 0, 0.16)
    return out


def sword_shing(seed):
    """Metallic gleam: sharp 'tink' + shimmering inharmonic ring + upward scrape; travels hilt (R) → tip (L)."""
    dur = 2.4
    n = ns(dur)
    t = tv(n)
    r = rng(seed)
    ring = np.zeros(n)
    for i, f in enumerate([2950, 4230, 5570, 7010, 8820, 10650]):
        det = r.uniform(1.5, 4.5)
        e = env(n, 0.0008, 1.5 / (1 + 0.35 * i)) / (1 + 0.6 * i)
        ring += e * (osc(np.full(n, f - det / 2), r.uniform(0, 6.28)) + osc(np.full(n, f + det / 2), r.uniform(0, 6.28)))
    ring /= np.max(np.abs(ring))
    scr = swept_noise(n, 2800 * 3.4 ** np.clip(t / 0.55, 0, 1), 0.35, seed + 3)
    scr *= sstep(t / 0.04) * np.exp(-np.maximum(t - 0.05, 0) / 0.22)
    tink = unit(hp(white(n, seed + 4), 4000)) * env(n, 0.0002, 0.004)
    pan = 0.65 - 1.3 * sstep(t / 0.6)
    out = pan2(0.42 * ring + 0.22 * scr + 0.30 * tink, pan)
    sw = unit(lp(white(n, seed + 5), 400)) * env(n, 0.03, 0.12) * 0.06                  # faint air swish
    return fade(out + mono2(sw), 0.0, 0.05)


def radar_ping(seed):
    n = ns(1.6)
    t = tv(n)
    f = 1250 * (1 + 0.015 * np.exp(-t / 0.12))
    tone = osc(f) * env(n, 0.0015, 0.30) + 0.22 * osc(2.71 * f) * env(n, 0.0015, 0.07) \
        + 0.12 * osc(0.5 * f) * env(n, 0.003, 0.25)
    y = tone + unit(bp(white(n, seed), 1200, 8000)) * env(n, 0.0002, 0.003) * 0.35
    y = y + 0.30 * delay(lp(y, 2600), 0.27) + 0.14 * delay(lp(y, 2000), 0.54) + 0.06 * delay(lp(y, 1500), 0.81)
    return fade(y, 0.0, 0.08)


def data_tick(seed, f=3400.0):
    n = ns(0.03)
    y = unit(bp(white(n, seed), 2500, 9000)) * env(n, 0.0002, 0.0012) * 0.5 \
        + osc(np.full(n, f)) * env(n, 0.0004, 0.004) * 0.5
    return fade(y, 0.0, 0.004)


def hud_chirp(seed, f0=1300.0, f1=2900.0, d=0.035):
    n = ns(0.12)
    t = tv(n)
    y = osc(f0 + (f1 - f0) * np.clip(t / d, 0, 1)) * env(n, 0.001, 0.025) * 0.6 \
        + unit(hp(white(n, seed), 3000)) * env(n, 0.0002, 0.0015) * 0.15
    return fade(y, 0.0, 0.01)


def ui_blip(seed):
    n = ns(0.5)
    t = tv(n)
    f = 1900 * (1 + 0.04 * np.exp(-t / 0.008))
    tone = osc(f) * env(n, 0.0008, 0.05) + 0.3 * osc(2 * f) * env(n, 0.0008, 0.02)
    click = unit(hp(white(n, seed), 2500)) * env(n, 0.0002, 0.0015) * 0.3
    thock = osc(95 + 90 * np.exp(-t / 0.012)) * env(n, 0.001, 0.06) * 0.7
    sparkle = unit(bp(white(n, seed + 1), 5000, 12000)) * env(n, 0.001, 0.08) * 0.05
    return fade(0.55 * tone + click + thock + sparkle, 0.0, 0.02)


def bracket_snap(seed):
    n = ns(0.15)
    t = tv(n)
    y = unit(bp(white(n, seed), 1500, 9000)) * env(n, 0.0002, 0.003) * 0.4 \
        + osc(np.full(n, 2600.0)) * env(n, 0.0005, 0.012) * 0.25 \
        + osc(140 + 120 * np.exp(-t / 0.006)) * env(n, 0.0008, 0.02) * 0.5
    return fade(y, 0.0, 0.01)


def lock_tone(dur, f=1180.0, att=0.003, rel=0.008):
    """Band-limited square avionics tone (odd harmonics < 9 kHz)."""
    n = ns(dur)
    t = tv(n)
    y = np.zeros(n)
    k = 1
    while k * f < 9000:
        y += np.sin(2 * np.pi * k * f * t) / k ** 1.25
        k += 2
    y /= np.max(np.abs(y))
    return fade(y, att, rel)


def riser(dur, seed, f0=220.0, f1=7500.0, tail=0.10, stutter=(3.0, 26.0), sub=0.35):
    n = ns(dur + tail)
    t = tv(n)
    p = np.clip(t / dur, 0, 1)
    after = t > dur
    fc = f0 * (f1 / f0) ** (p ** 1.5)
    nz = swept_noise(n, fc, 0.5, seed, stereo=True, corr=0.25)
    amp = p ** 2.4 * ramp_in(n, 0.05)
    amp[after] = np.exp(-(t[after] - dur) / 0.03)
    if stutter:
        rate = stutter[0] + (stutter[1] - stutter[0]) * p ** 2
        am = 1 - 0.4 * (0.5 + 0.5 * np.cos(2 * np.pi * np.cumsum(rate) / SR)) * p
        amp = amp * am
    sa = p ** 2.2
    sa[after] = np.exp(-(t[after] - dur) / 0.03)
    out = nz * amp[:, None] * 0.5 + mono2(osc(28 + 45 * p ** 2) * sa * sub)
    return fade(out, 0.01, 0.02)


def whoosh(dur, seed, f_start=350.0, f_peak=2600.0, f_end=700.0, peak=0.45, pan0=-0.6, pan1=0.6, sigma=0.7,
           body=0.5, grit=0.0):
    n = ns(dur)
    t = tv(n)
    p = t / dur
    rise = np.clip(p / peak, 0, 1)
    fall = np.clip((1 - p) / (1 - peak), 0, 1)
    amp = np.where(p < peak, rise ** 2.2, fall ** 1.6)
    lf = np.where(p < peak, np.log(f_start) + (np.log(f_peak) - np.log(f_start)) * rise,
                  np.log(f_end) + (np.log(f_peak) - np.log(f_end)) * fall)
    nz = swept_noise(n, np.exp(lf), sigma, seed)
    out = pan2(nz * amp, pan0 + (pan1 - pan0) * sstep(p))
    if body:
        out += mono2(unit(lp(white(n, seed + 1), 220)) * amp ** 1.5 * body * 0.5)
    if grit:
        g = crackle(n, 900 * amp, seed + 2, hp_f=1800)
        out += pan2(g * amp * grit, 0.3 * (pan0 + pan1))
    return fade(out * 0.6, 0.002, 0.01)


def reverse_swell(dur, seed, f0=500.0, f1=6000.0):
    n = ns(dur)
    p = tv(n) / dur
    nz = swept_noise(n, f0 * (f1 / f0) ** p, 0.8, seed, stereo=True, corr=0.3)
    return fade(nz * (p ** 3)[:, None], 0.005, 0.004)


def flash_bloom(seed, dur=0.6):
    n = ns(dur)
    t = tv(n)
    sh = swept_noise(n, 1500 + 7000 * np.exp(-t / 0.3), 0.6, seed, stereo=True, corr=0.2)
    out = sh * env(n, 0.002, 0.12)[:, None]
    add_at(out, metal_ring(dur, seed + 1, f0=1450, decay=0.25), 0, 0.15)
    return fade(out, 0.0, 0.05)


def jet_flyby(dur, t_peak, v=150.0, d=25.0, seed=0, direction=1.0, base_fc=950.0, whine=0.25, rumble=1.0,
              crackle_amt=0.5, hiss=0.5, fade_in=0.35, fade_out=0.5):
    """Straight-line flyby. t_peak (s, relative) = closest approach. Doppler factor D = 1/(1 + v_r/c)."""
    n = ns(dur)
    t = tv(n)
    x = v * (t - t_peak)
    r = np.sqrt(x * x + d * d)
    D = 1.0 / (1.0 + (v * x / r) / 343.0)
    A = d / r                                          # 1/r, = 1 at closest approach
    behind = 0.5 * (1 + x / r)                         # 0 approaching → 1 receding (exhaust side is louder)
    absorb = np.exp(-(r - d) / 400.0)                  # air absorption of the highs
    pan = direction * np.clip(x / np.sqrt(x * x + (0.8 * d) ** 2), -1, 1) * 0.9
    roar = swept_noise(n, base_fc * D, 0.85, seed)                      # doppler-swept roar
    hs = swept_noise(n, 4200 * D, 0.55, seed + 1)
    wh = osc(3150 * D * (1 + 0.003 * smooth_rand(n, 6, seed + 2))) * (0.7 + 0.3 * smooth_rand(n, 9, seed + 5))
    cr = crackle(n, 90 * behind * A, seed + 3)
    rum = unit(lp(white(n, seed + 4), 130, 4))
    mono = ((0.55 + 0.45 * behind) * roar * A + hiss * hs * A * absorb
            + whine * wh * A * absorb * (1 - 0.8 * behind) + crackle_amt * cr * A)
    out = pan2(mono, pan) + pan2(rumble * rum * A ** 0.7, 0.4 * pan)
    w = ramp_in(n, fade_in) * fade(np.ones(n), 0.0, fade_out)
    return out * w[:, None] * 0.5


def afterburner(seed):
    """Four-ship climb 17.4 → 21.4; afterburners light at +1.2 s (= 18.6)."""
    dur, ti = 3.3, 1.2
    n = ns(dur)
    t = tv(n)
    out = np.zeros((n, 2))
    for k, (pan, off) in enumerate(zip([-0.55, -0.2, 0.2, 0.55], [0.0, 0.035, 0.07, 0.11])):
        pt = t - ti - off
        on = sstep(pt / 0.035)
        pre = 0.32 * sstep(t / 1.2)
        post = 1.0 / (1 + 0.9 * np.maximum(pt, 0))
        amp = pre * (1 - on) + post * on
        fc = (700 * (1 + 0.3 * np.clip(t / 1.2, 0, 1))) * (1 - on) + 650 * (0.6 + 0.4 * np.exp(-np.maximum(pt, 0) / 0.8)) * on
        roar = swept_noise(n, fc, 1.0, seed + 10 * k)
        hs = swept_noise(n, fc * 4.5, 0.6, seed + 10 * k + 1)
        cr = crackle(n, 160 * on * amp + 10, seed + 10 * k + 2)
        mono = roar * amp * 0.5 + cr * amp * 0.30 + hs * amp ** 1.6 * 0.22
        out += pan2(mono, pan)
    rum = unit(lp(st_noise(n, seed + 90, 0.5), 120, 4))
    on0 = sstep((t - ti) / 0.035)
    out += rum * ((0.3 * sstep(t / 1.2)) * (1 - on0) + on0 / (1 + 0.9 * np.maximum(t - ti, 0)))[:, None] * 0.35
    out *= sstep((dur - t) / 0.9)[:, None]             # mostly gone at 20.4 (cut to the cockpit HUD)
    add_at(out, impact(0.75, seed + 50, sub_hi=85, sub_lo=30, crack=0.8, sizzle=0.6), ns(ti), 0.9)
    return fade(out * 0.6, 0.02, 0.02)


def missile(seed, dur=2.4, pan_to=0.75, f_hi=2600.0, f_lo=650.0, ign=1.0):
    n = ns(dur)
    t = tv(n)
    amp = ramp_in(n, 0.012) / (1 + 2.2 * t)
    fc = f_lo + (f_hi - f_lo) * np.exp(-t / 0.6)
    mono = (swept_noise(n, fc, 0.7, seed + 1) * amp * 0.6 + crackle(n, 220 * amp, seed + 2) * amp * 0.35
            + swept_noise(n, fc * 3.2, 0.5, seed + 3) * amp ** 1.5 * 0.3)
    out = pan2(mono, pan_to * sstep(t / 0.9))
    if ign:
        add_at(out, impact(0.45, seed, sub_hi=90, sub_lo=40, crack=1.6, tail=0.5), 0, 0.8 * ign)
    return fade(out, 0.0, 0.1)


def cannon(seed, size=1.0):
    """Tank main gun: N-wave blast + crack + sub + body + shock-wave dust (desert reverb added via send)."""
    dur = 3.0
    n = ns(dur)
    t = tv(n)
    k = ns(0.004)
    blast = np.zeros(n)
    blast[:k] = 1 - 2 * np.arange(k) / k
    blast = lp(blast, 9000)
    crack = unit(hp(st_noise(n, seed, 0.5), 800)) * env(n, 0.0002, 0.018)[:, None]
    sub = sat(osc(28 + 52 * np.exp(-t / 0.06)) * env(n, 0.001, 0.45 * size), 2.0)
    body = unit(bp(white(n, seed + 1), 60, 700)) * env(n, 0.001, 0.22)
    dust = unit(lp(st_noise(n, seed + 2, 0.3), 1400)) * env(n, 0.03, 0.6)[:, None]
    out = mono2(0.5 * blast + 0.7 * sub + 0.45 * body) + 0.35 * crack + 0.14 * dust
    add_at(out, metal_ring(0.8, seed + 3, f0=610, decay=0.25), ns(0.55), 0.05)     # breech clank
    return fade(out, 0.0, 0.1)


def distant_boom(seed, size=0.9):
    return lp(impact(size, seed, crack=0.3, sizzle=0.2), 450)


def tank_bed(dur, seed, clank_rate=9.0, fin=0.4, fout=0.8):
    n = ns(dur)
    t = tv(n)
    r = rng(seed + 5)
    eng = unit(lp(st_noise(n, seed, 0.6), 110, 4)) * (0.75 + 0.25 * smooth_rand(n, 2.5, seed + 1))[:, None]
    growl = unit(bp(white(n, seed + 2), 90, 400)) * (0.6 + 0.4 * smooth_rand(n, 5, seed + 3))
    whine = osc(3900 * (1 + 0.004 * smooth_rand(n, 0.7, seed + 4))) * 0.05
    out = eng * 0.5 + mono2(growl * 0.35 + whine)
    tt = 0.05
    i = 0
    while tt < dur - 0.05:
        m = ns(0.04)
        ck = (unit(bp(white(m, seed + 100 + i), 1200, 4500)) * env(m, 0.0003, 0.004)
              + osc(np.full(m, 2100 + 600 * r.random())) * env(m, 0.0005, 0.012) * 0.4)
        add_at(out, pan2(ck, r.uniform(-0.6, 0.6)), ns(tt), 0.10 * r.uniform(0.3, 1.0))
        tt += (1 / clank_rate) * r.uniform(0.6, 1.4)
        i += 1
    w = ramp_in(n, fin) * fade(np.ones(n), 0.0, fout)
    return out * w[:, None]


def helicopter(dur, t_peak, v=45.0, d=40.0, seed=0, rate=12.5, direction=1.0, fade_in=0.25, fade_out=0.35):
    n = ns(dur)
    t = tv(n)
    x = v * (t - t_peak)
    r = np.sqrt(x * x + d * d)
    D = 1 / (1 + (v * x / r) / 343.0)
    A = d / r
    pan = direction * np.clip(x / r, -1, 1) * 0.85
    ph = np.cumsum(rate * D) / SR
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1
    rr = rng(seed)
    imp = np.zeros(n)
    imp[idx] = (1.0 - 0.18 * (np.arange(len(idx)) % 2)) * rr.uniform(0.85, 1.0, len(idx))
    kn = ns(0.09)
    kt = tv(kn)
    whop = (unit(bp(white(kn, seed + 1), 70, 650)) * env(kn, 0.004, 0.02) * 0.5
            + osc(52 * (1 + 0.5 * np.exp(-kt / 0.008))) * env(kn, 0.003, 0.028) * 0.8)
    slap = unit(bp(white(kn, seed + 2), 600, 3000)) * env(kn, 0.001, 0.008) * 0.15
    thump = ss.oaconvolve(imp, whop)[:n]
    slaps = ss.oaconvolve(imp, slap)[:n] * (1 - 0.5 * (0.5 * (1 + x / r)))
    turb = osc(1850 * D * (1 + 0.003 * smooth_rand(n, 3, seed + 3))) * 0.03 + swept_noise(n, 2400 * D, 0.3, seed + 4) * 0.05
    tail_rotor = unit(bp(white(n, seed + 5), 500, 2500)) * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(5.3 * rate * D) / SR)) ** 6 * 0.07
    wash = unit(lp(white(n, seed + 6), 300)) * 0.12
    out = pan2((thump + slaps + turb + tail_rotor + wash) * A ** 0.9, pan)
    w = ramp_in(n, fade_in) * fade(np.ones(n), 0.0, fade_out)
    return out * w[:, None]


def glitch(seed):
    """Digital glitch: bit-crushed bursts, buzzes, stutters, chirps. Strong burst exactly at t=0."""
    dur = 0.7
    n = ns(dur)
    r = rng(seed)
    out = np.zeros((n, 2))

    def crushed(ln, sh, bits, s):
        m = ns(ln)
        src = bp(white(m, s), 200, 9000)
        src = np.repeat(src[::sh], sh)[:m]
        q = 2 ** (bits - 1)
        return np.round(src / (np.max(np.abs(src)) + 1e-9) * q) / q

    def buzz(ln, f):
        m = ns(ln)
        tt = tv(m)
        y = np.zeros(m)
        k = 1
        while k * f < 6000:
            y += np.sin(2 * np.pi * k * f * tt) / k
            k += 2
        return y / np.max(np.abs(y))

    first = crushed(0.05, 6, 4, seed)
    add_at(out, pan2(fade(first, 0.0003, 0.002), 0.0), 0, 0.9)
    tt, i = 0.06, 0
    while tt < 0.55:
        typ = ['crush', 'buzz', 'stutter', 'chirp'][int(r.integers(0, 4))]
        ln = float(r.uniform(0.015, 0.06))
        g = float(r.uniform(0.3, 0.7))
        pn = float(r.uniform(-0.7, 0.7))
        if typ == 'crush':
            y = crushed(ln, int(r.integers(4, 16)), int(r.integers(3, 6)), seed + 10 + i)
        elif typ == 'buzz':
            y = buzz(ln, float(r.uniform(60, 220)))
        elif typ == 'stutter':
            sl = first[:ns(0.012)]
            y = np.tile(fade(sl, 0.0005, 0.002), 3 + int(r.integers(0, 3)))
        else:
            m = ns(ln)
            y = osc(float(r.uniform(500, 1500)) * (float(r.uniform(2.0, 4.5))) ** (tv(m) / ln))
        add_at(out, pan2(fade(y, 0.0008, 0.002), pn), ns(tt), g)
        tt += len(y) / SR + float(r.uniform(0.005, 0.05))
        i += 1
    m = ns(0.2)
    add_at(out, mono2(osc(80 + 120 * np.exp(-tv(m) / 0.01)) * env(m, 0.0005, 0.04)), 0, 0.6)
    return fade(lp(out, 11000), 0.0, 0.01)


def sea(dur, seed, fin=0.3, fout=0.5):
    n = ns(dur)
    t = tv(n)
    sw = (0.5 + 0.5 * np.sin(2 * np.pi * t / 2.6 + 1.0)) ** 2 * (0.7 + 0.3 * smooth_rand(n, 0.5, seed))
    wash = swept_noise(n, 350 + 1600 * sw, 1.0, seed + 1, stereo=True, corr=0.3) * sw[:, None]
    low = unit(lp(st_noise(n, seed + 2, 0.5), 160)) * (0.4 + 0.6 * sw)[:, None] * 0.5
    w = ramp_in(n, fin) * fade(np.ones(n), 0.0, fout)
    return (wash * 0.5 + low) * w[:, None]


def flag_flap(dur, seed, fin=0.6, fout=0.6):
    n = ns(dur)
    r = rng(seed)
    out = unit(bp(st_noise(n, seed, 0.3), 300, 3500)) * (0.35 + 0.2 * smooth_rand(n, 3, seed + 1))[:, None] * 0.3
    m = ns(0.12)
    tt, i = 0.05, 0
    while tt < dur - 0.12:
        k = unit(bp(white(m, seed + 10 + i), 250, 2200)) * env(m, 0.003, 0.03)
        add_at(out, pan2(k, r.uniform(-0.3, 0.3)), ns(tt), 0.6 * r.uniform(0.4, 1.0))
        tt += r.uniform(0.11, 0.3)
        i += 1
    w = ramp_in(n, fin) * fade(np.ones(n), 0.0, fout)
    return out * w[:, None]


def radar_scan(dur, seed, period=1.2):
    n = ns(dur)
    t = tv(n)
    a = (0.5 + 0.5 * np.cos(2 * np.pi * t / period)) ** 8
    y = swept_noise(n, 1200 + 800 * a, 0.5, seed, stereo=True, corr=0.4) * a[:, None]
    return fade(y, 0.2, 0.3)


def shimmer_swell(dur, seed):
    n = ns(dur)
    t = tv(n)
    a = sstep(t / (0.7 * dur)) * fade(np.ones(n), 0.0, 0.3 * dur)
    y = swept_noise(n, 3000 + 3000 * t / dur, 0.5, seed, stereo=True, corr=0.1)
    return y * (a * (0.8 + 0.2 * np.sin(2 * np.pi * 5.5 * t)))[:, None]


def low_swell(seed, dur=2.4):
    """Reverent low swell for «بإذن الله» — slow rise, no transient."""
    n = ns(dur)
    t = tv(n)
    a = sstep(t / 0.9) * np.exp(-np.maximum(t - 1.0, 0) / 0.6)
    rum = unit(lp(st_noise(n, seed, 0.5), 220)) * 0.35
    air = unit(bp(st_noise(n, seed + 1, 0.2), 300, 1500)) * 0.10
    sub = osc(41 * (1 + 0.01 * smooth_rand(n, 0.8, seed + 2))) * (0.85 + 0.15 * smooth_rand(n, 2, seed + 3)) * 0.5
    return fade((rum + air) * a[:, None] + mono2(sub * a), 0.01, 0.2)


def ambience(seed=900):
    """Subtle bed: desert wind (gusting), high-altitude air in S3, low room/drone in the HUD/command scenes."""
    n = N
    t = tv(n)

    def pw(pts):
        return np.interp(t, [p[0] for p in pts], [p[1] for p in pts])

    w_wind = pw([(0, 0), (5.8, 0), (6.3, 1), (11.6, 1), (12.2, 0.45), (23.6, 0.45), (24.2, 1), (33.8, 1),
                 (34.2, 0.12), (41.8, 0.12), (42.2, 0.8), (58.6, 0.8), (59.0, 1), (67, 1)])
    w_sky = pw([(0, 0), (11.6, 0), (12.2, 1), (23.6, 1), (24.0, 0), (67, 0)])
    w_room = pw([(0, 1), (5.8, 1), (6.2, 0.15), (33.8, 0.15), (34.2, 1), (41.8, 1), (42.2, 0.2), (67, 0.2)])
    gust = 0.55 + 0.45 * smooth_rand(n, 0.22, seed)
    wind = unit(bp(st_noise(n, seed + 1, 0.35), 90, 900)) * gust[:, None]
    gust_hi = unit(bp(st_noise(n, seed + 2, 0.2), 700, 3200)) * (np.maximum(smooth_rand(n, 0.3, seed + 3), 0) ** 2)[:, None]
    sky = unit(bp(st_noise(n, seed + 4, 0.2), 400, 5000)) * (0.7 + 0.3 * smooth_rand(n, 0.4, seed + 5))[:, None]
    room = unit(lp(st_noise(n, seed + 6, 0.6), 75, 4)) + 0.04 * unit(bp(st_noise(n, seed + 7, 0.2), 2000, 8000))
    room *= (0.8 + 0.2 * smooth_rand(n, 0.15, seed + 8))[:, None]
    bed = (wind * 0.05 + gust_hi * 0.02) * w_wind[:, None] + sky * 0.022 * w_sky[:, None] + room * 0.015 * w_room[:, None]
    return hp(bed, 28.0, 2) * ramp_in(n, 0.5)[:, None]


# ============================================================================================ SFX timeline
def E(t, make, gain=1.0, pan=0.0, hall=0.0, desert=0.0, cue=None, hero=False):
    return dict(t=float(t), make=make, gain=gain, pan=pan, hall=hall, desert=desert, cue=cue, hero=hero)


# "Suck" before hero hits: everything except the hero events dips (after reverb) and recovers under the hit.
# (time, depth dB, pre-dip duration, recovery duration)
DUCKS = [(14.4, -7.0, 0.08, 0.25), (56.4, -8.0, 0.10, 0.40), (60.0, -14.0, 0.14, 0.60)]


def duck_env():
    t = tv(N)
    g_db = np.zeros(N)
    for tc, depth, pre, post in DUCKS:
        a = (t >= tc - pre) & (t < tc)
        g_db[a] = np.minimum(g_db[a], depth * sstep((t[a] - (tc - pre)) / (0.5 * pre)))
        b = (t >= tc) & (t < tc + post)
        g_db[b] = np.minimum(g_db[b], depth * (1 - sstep((t[b] - tc) / post)))
    return 10 ** (g_db / 20)


def countup_ticks(cue, val, step=7):
    """Tick each time the counter passes a multiple of `step` (cosine ease over [cue-1.05, cue])."""
    start = cue - 1.05
    out = []
    for k in range(1, val // step + 1):
        p = np.arccos(1 - 2 * k * step / val) / np.pi
        tt = start + 1.05 * p
        if tt < cue - 0.06:
            out.append(round(float(tt), 4))
    return out


def sfx_events():
    ev = []
    r = rng(4242)
    # ---------------- S1 · intro HUD 0–6
    for i, (tp, pn) in enumerate([(0.6, 0.45), (1.8, -0.4), (3.0, 0.15)]):
        ev.append(E(tp, lambda s=10 + i: radar_ping(s), 0.16, pn, hall=0.35, cue='ping'))
    base = np.linspace(1.2, 2.56, 17) + np.r_[0.0, r.uniform(-0.015, 0.015, 16)]  # typewriter «جارٍ تحليل المشهد…»
    for k, tt in enumerate(base):
        if abs(tt - 1.8) < 0.05:
            continue
        ev.append(E(tt, lambda s=100 + k: data_tick(s, 3400 + 300 * (s % 3)), 0.10 * r.uniform(0.75, 1.1),
                    -0.15 + 0.3 * r.random(), hall=0.05, cue='ticks'))
    for k, tt in enumerate([3.14, 3.31, 3.47, 3.62, 3.79, 3.95, 4.08, 4.21]):  # HUD panels populate
        ev.append(E(tt, lambda s=130 + k: hud_chirp(s, 1100 + 150 * (s % 4), 2600 + 200 * (s % 3)),
                    0.07, (-0.6, 0.6)[k % 2] * r.uniform(0.4, 1.0), hall=0.1))
    ev.append(E(4.2, lambda: riser(1.6, 50), 0.42, hall=0.15, cue='riser1'))
    ev.append(E(5.8, lambda: flash_bloom(55), 0.18, hall=0.3))
    # ---------------- S2 · flag & title 6–12
    ev.append(E(6.0, lambda: huge_impact(1.3, 60), 0.66, hall=0.4))
    ev.append(E(6.05, lambda: flag_flap(5.5, 61, fin=1.0), 0.05))
    ev.append(E(6.6, lambda: metal_slam(62), 0.60, hall=0.45))
    ev.append(E(8.4, lambda: sword_shing(63), 0.42, hall=0.5))
    ev.append(E(10.2, lambda: text_hit(0.8, 64), 0.58, hall=0.35))
    ev.append(E(11.4, lambda: whoosh(0.8, 65, 300, 3400, 1500, peak=0.5, pan0=0.0, pan1=0.0, body=0.6),
                0.60, hall=0.15, cue='whoosh1'))
    # ---------------- S3 · air force 12–24
    ev.append(E(12.0, lambda: jet_flyby(5.5, 2.4, v=150, d=14, seed=70, direction=1.0, fade_in=0.5, fade_out=1.2),
                0.62, hall=0.08, cue='jet1'))
    ev.append(E(14.4, lambda: impact(0.65, 71, sub_hi=85, sub_lo=32, crack=1.3, sizzle=0.8), 0.55, hall=0.2, hero=True))
    ev.append(E(15.0, lambda: text_hit(0.75, 72, metal=0.1), 0.55, hall=0.35))
    ev.append(E(15.0, lambda: bracket_snap(73), 0.25, -0.3))
    ev.append(E(16.2, lambda: impact(0.4, 74, crack=0.8), 0.32, hall=0.3))
    ev.append(E(16.2, lambda: bracket_snap(75), 0.2, 0.3))
    ev.append(E(17.4, lambda: afterburner(80), 0.9, hall=0.12, cue='ab'))
    beeps = [20.4, 20.6, 20.78, 20.94, 21.08, 21.2, 21.30, 21.39, 21.47]
    for k, tb in enumerate(beeps):
        d = 0.075 - 0.03 * k / (len(beeps) - 1)
        ev.append(E(tb, lambda d=d: lock_tone(d), 0.19, 0.1, hall=0.08, cue='beeps'))
    ev.append(E(21.6, lambda: lock_tone(0.62, rel=0.06), 0.24, 0.1, hall=0.08))
    ev.append(E(21.6, lambda: bracket_snap(81), 0.3, 0.0))
    ev.append(E(22.2, lambda: missile(82), 0.62, hall=0.2))
    ev.append(E(23.4, lambda: jet_flyby(1.3, 0.28, v=190, d=7, seed=83, direction=-1.0, base_fc=1100, fade_in=0.06,
                                        fade_out=0.35, crackle_amt=0.7), 0.55, hall=0.08, cue='whoosh2'))
    ev.append(E(23.4, lambda: whoosh(0.7, 84, 500, 3000, 600, peak=0.35, pan0=-0.7, pan1=0.7, body=0.7),
                0.45, cue='whoosh2'))
    # ---------------- S4 · ground forces 24–34
    ev.append(E(24.0, lambda: tank_bed(4.6, 90), 0.15))
    ev.append(E(25.2, lambda: text_hit(0.8, 91), 0.58, hall=0.3))
    ev.append(E(27.0, lambda: cannon(92), 0.60, -0.05, hall=0.05, desert=0.6))
    ev.append(E(28.2, lambda: helicopter(3.6, 1.7, v=45, d=35, seed=93, rate=12.5, direction=1.0), 0.55,
                hall=0.05, desert=0.1, cue='rotor'))
    ev.append(E(28.5, lambda: helicopter(3.3, 1.9, v=45, d=55, seed=94, rate=11.8, direction=1.0, fade_in=0.5),
                0.35, hall=0.05, desert=0.1, cue='rotor'))
    ev.append(E(30.6, lambda: cannon(95, 0.95), 0.60, 0.15, hall=0.05, desert=0.6))
    ev.append(E(31.8, lambda: text_hit(0.8, 96), 0.58, hall=0.3))
    ev.append(E(33.6, lambda: whoosh(0.7, 97, 250, 2200, 500, peak=0.4, pan0=0.5, pan1=-0.5, body=0.9, grit=0.5),
                0.6, hall=0.1, desert=0.15, cue='whoosh3'))
    # ---------------- S5 · scene analysis 34–42
    ev.append(E(34.2, lambda: glitch(100), 0.48, hall=0.12))
    ev.append(E(34.2, lambda: whoosh(0.65, 101, 600, 4000, 2500, peak=0.7, pan0=-0.3, pan1=0.3, body=0.0), 0.09))
    for i, (cue, val) in enumerate([(36.0, 98), (37.2, 100), (38.4, 100), (39.6, 96)]):
        for k, tt in enumerate(countup_ticks(cue, val)):
            ev.append(E(tt, lambda s=200 + 20 * i + k: data_tick(s, 4200), 0.045, 0.35, hall=0.05))
        ev.append(E(cue, lambda s=110 + i: ui_blip(s), 0.34, 0.35, hall=0.15))
    for k, tt in enumerate([40.32, 40.48, 40.64]):
        ev.append(E(tt, lambda s=120 + k: bracket_snap(s), 0.16, (-0.4, 0.4, 0.0)[k], hall=0.1))
    ev.append(E(40.6, lambda: reverse_swell(0.2, 123, 800, 5000), 0.10))
    ev.append(E(40.8, lambda: lock_tone(0.5, rel=0.12), 0.15, 0.0, hall=0.1))
    ev.append(E(40.8, lambda: text_hit(0.85, 124, metal=0.15), 0.52, hall=0.35))
    ev.append(E(40.95, lambda: whoosh(0.45, 125, 1500, 5000, 3000, peak=0.5, pan0=0.6, pan1=-0.6, body=0.0), 0.06))
    ev.append(E(41.4, lambda: riser(0.6, 126, 300, 8000, stutter=(8.0, 30.0)), 0.48, hall=0.1, cue='riser2'))
    # ---------------- S6 · seven days 42–58.8
    days = [42.0, 44.4, 46.8, 49.2, 51.6, 54.0, 56.4]
    for d, td in enumerate(days):
        if d == 6:
            ev.append(E(td - 0.6, lambda: reverse_swell(0.585, 146, 400, 7000), 0.20, hero=True))
            ev.append(E(td, lambda: huge_impact(1.6, 156), 0.75, hall=0.45, hero=True))
        else:
            if d > 0:
                ev.append(E(td - 0.4, lambda s=140 + d: reverse_swell(0.385, s), 0.12))   # ends 15 ms early
            ev.append(E(td, lambda s=150 + d, z=1.0 + 0.03 * d: text_hit(z, s, metal=0.1, f0=470), 0.62 + 0.015 * d,
                        hall=0.35))
    ev.append(E(42.05, lambda: jet_flyby(2.9, 1.3, v=210, d=110, seed=160, direction=1.0, fade_in=0.4, fade_out=0.8),
                0.45, hall=0.1))
    ev.append(E(44.5, lambda: radar_scan(2.2, 161), 0.035))
    ev.append(E(45.0, lambda: radar_ping(162), 0.12, -0.5, hall=0.3))
    ev.append(E(46.2, lambda: radar_ping(163), 0.10, 0.5, hall=0.3))
    ev.append(E(47.1, lambda: missile(164, dur=1.6, pan_to=-0.7, ign=0.4), 0.22, -0.3, hall=0.1))
    ev.append(E(47.4, lambda: missile(165, dur=1.6, pan_to=0.7, ign=0.4), 0.20, 0.3, hall=0.1))
    for k, (tt, g) in enumerate([(47.85, 0.35), (48.15, 0.30), (48.6, 0.38)]):
        ev.append(E(tt, lambda s=166 + k: distant_boom(s), g, (-0.4, 0.3, 0.0)[k], desert=0.6))
    ev.append(E(49.25, lambda: tank_bed(2.5, 170, fin=0.3, fout=0.5), 0.12))
    ev.append(E(50.4, lambda: distant_boom(171, 1.0), 0.30, 0.3, desert=0.6))
    ev.append(E(51.65, lambda: sea(2.45, 172), 0.12))
    ev.append(E(52.8, lambda: distant_boom(173), 0.25, -0.3, desert=0.5))
    ev.append(E(54.05, lambda: helicopter(2.5, 1.2, v=45, d=70, seed=174, rate=12.5, direction=-1.0, fade_in=0.3,
                                          fade_out=0.5), 0.35, desert=0.1))
    ev.append(E(54.2, lambda: jet_flyby(2.3, 1.3, v=200, d=90, seed=175, fade_in=0.4, fade_out=0.6), 0.40, hall=0.1))
    ev.append(E(56.45, lambda: flag_flap(2.3, 176, fin=0.5, fout=0.5), 0.05))
    ev.append(E(56.6, lambda: shimmer_swell(1.6, 177), 0.04, hall=0.3))
    ev.append(E(58.2, lambda: riser(0.6, 178, 400, 9000, stutter=(10.0, 30.0)), 0.45, hall=0.15, cue='riser3'))
    ev.append(E(58.8, lambda: flash_bloom(179), 0.20, hall=0.35))
    # ---------------- S7 · finale 58.8–67
    for k, (tp, d, pn) in enumerate([(0.30, 35, 1.0), (0.36, 50, -1.0), (0.42, 65, 1.0), (0.48, 80, -1.0)]):
        ev.append(E(59.4, lambda tp=tp, d=d, pn=pn, s=180 + 10 * k: jet_flyby(2.9, tp, v=170, d=d, seed=s, direction=pn,
                                                                            fade_in=0.12, fade_out=0.9),
                    0.40, hall=0.1, cue='jet7'))
    ev.append(E(59.4, lambda: reverse_swell(0.54, 189, 300, 6000), 0.18, hero=True))
    ev.append(E(60.0, lambda: huge_impact(1.75, 190), 0.90, hall=0.5, hero=True))
    ev.append(E(61.2, lambda: text_hit(0.9, 191, metal=0.15), 0.60, hall=0.4))
    ev.append(E(62.4, lambda: low_swell(192), 0.40, hall=0.3, cue='swell'))
    ev.append(E(64.2, lambda: text_hit(0.6, 193, metal=0.08), 0.38, hall=0.4))
    ev.append(E(64.25, lambda: flag_flap(2.2, 194, fin=0.6, fout=0.6), 0.05))
    ev.append(E(66.0, lambda: fade(impact(1.3, 195, sub_hi=90, sub_lo=30, dur=1.0), 0.0, 0.45), 0.62, hall=0.15))
    return ev


def render_sfx(events=None, reverb=True, bed=True):
    rest, hero = Mixer(), Mixer()
    for e in (sfx_events() if events is None else events):
        (hero if e['hero'] else rest).add(e['make'](), e['t'], e['gain'], e['pan'], hall=e['hall'], desert=e['desert'])
    r_out = (rest.render() if reverb else rest.dry.copy())[:N]
    if bed:
        r_out += ambience()
    out = r_out * duck_env()[:, None] + (hero.render() if reverb else hero.dry.copy())[:N]
    return dc_block(out) if reverb else out


# ============================================================================================ drums
MEM_RATIOS = np.array([1.0, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501])   # circular membrane modes
MEM_AMPS = np.array([1.0, 0.5, 0.36, 0.25, 0.18, 0.13, 0.1, 0.08])
MEM_TAUS = np.array([1.0, 0.5, 0.38, 0.33, 0.28, 0.24, 0.21, 0.19])


def membrane(f0, dur, tau0, seed, bend=0.35, bend_tau=0.03, amps=MEM_AMPS):
    n = ns(dur)
    t = tv(n)
    r = rng(seed)
    glide = 1 + bend * np.exp(-t / bend_tau)
    y = np.zeros(n)
    for q, a, tf in zip(MEM_RATIOS, amps, MEM_TAUS):
        f = f0 * q * (1 + 0.006 * r.standard_normal())
        if f * (1 + bend) > 0.4 * SR:
            continue
        y += a * osc(f * glide, r.uniform(0, 2 * np.pi)) * np.exp(-t / (tau0 * tf))
    return y * ramp_in(n, 0.0008)


def taiko_parts(f0, size, seed):
    dur = 0.8 + 0.9 * size
    n = ns(dur)
    mem = membrane(f0, dur, 0.18 + 0.32 * size, seed, bend=0.4, bend_tau=0.022)
    return dict(mem=mem / np.max(np.abs(mem)),
                strike=unit(lp(white(n, seed + 1), 2000)) * env(n, 0.0004, 0.005),
                slap=unit(bp(white(n, seed + 2), 250, 1300)) * env(n, 0.0007, 0.02),
                body=unit(bp(white(n, seed + 3), 50, 240)) * env(n, 0.002, 0.10 + 0.08 * size))


def boom_parts(size, seed):
    dur = 1.2 + 1.2 * size
    n = ns(dur)
    t = tv(n)
    sub = sat(osc(33 + 42 * np.exp(-t / 0.07)) * env(n, 0.002, 0.22 + 0.28 * size), 1.6)
    knock = unit(bp(white(n, seed), 60, 500)) * env(n, 0.001, 0.035) * 0.25
    return dict(y=fade(sub + knock, 0.0, 0.05))


def snare_parts(seed):
    n = ns(0.45)
    t = tv(n)
    r = rng(seed)
    f1 = 215 * (1 + 0.02 * r.standard_normal())
    g = 1 + 0.18 * np.exp(-t / 0.006)
    shell = (osc(f1 * g, r.uniform(0, 6.28)) * np.exp(-t / 0.05)
             + 0.55 * osc(f1 * 1.62 * g, r.uniform(0, 6.28)) * np.exp(-t / 0.035)
             + 0.30 * osc(f1 * 2.30 * g, r.uniform(0, 6.28)) * np.exp(-t / 0.025)) * ramp_in(n, 0.0005)
    return dict(shell=shell / np.max(np.abs(shell)),
                wires=unit(bp(white(n, seed + 1), 1900, 9500)),
                wires_lo=unit(bp(white(n, seed + 2), 700, 2000)),
                click=unit(hp(white(n, seed + 3), 3000)) * env(n, 0.0002, 0.002))


def tom_parts(f0, seed):
    n = ns(0.9)
    mem = membrane(f0, 0.9, 0.26, seed, bend=0.28, bend_tau=0.04,
                   amps=np.array([1, .35, .22, .15, .1, .06, .05, .04]))
    return dict(y=mem / np.max(np.abs(mem)) + 0.25 * unit(lp(white(n, seed + 1), 3500)) * env(n, 0.0003, 0.004))


def rim_parts(seed):
    n = ns(0.12)
    t = tv(n)
    y = (0.6 * osc(np.full(n, 1650.0)) * np.exp(-t / 0.012) + 0.5 * osc(np.full(n, 830.0)) * np.exp(-t / 0.018)
         + 0.4 * unit(bp(white(n, seed), 1500, 6000)) * env(n, 0.0002, 0.003))
    return dict(y=fade(y * ramp_in(n, 0.0003), 0.0, 0.01))


def crash_parts(seed):
    n = ns(3.0)
    t = tv(n)
    nz = st_noise(n, seed, 0.25)
    y = (0.5 * unit(hp(nz, 3800)) * env(n, 0.0006, 0.9)[:, None]
         + 0.35 * unit(bp(nz, 5500, 12000)) * env(n, 0.003, 1.4)[:, None]) * (1 + 0.12 * np.sin(2 * np.pi * 6.3 * t))[:, None]
    return dict(y=fade(lp(y, 13000), 0.0, 0.1))


TOMS = {'hi': 165.0, 'mid': 132.0, 'low': 106.0, 'floor': 86.0}
INST_GAIN = {'taiko': 0.50, 'odaiko': 0.62, 'boom': 0.62, 'snare': 0.30, 'tom': 0.36, 'rim': 0.12, 'crash': 0.14}
INST_SEND = {'taiko': dict(room=0.35, hall=0.12), 'odaiko': dict(room=0.25, hall=0.22),
             'boom': dict(room=0.15, hall=0.20), 'snare': dict(room=0.40, hall=0.07),
             'tom': dict(room=0.35, hall=0.12), 'rim': dict(room=0.3, hall=0.05), 'crash': dict(room=0.2, hall=0.2)}


class Kit:
    def __init__(self):
        self.cache = {}

    def _p(self, key, fn):
        if key not in self.cache:
            self.cache[key] = fn()
        return self.cache[key]

    def render(self, inst, vel, var, **kw):
        if inst in ('taiko', 'odaiko'):
            f0, size = (78.0, 1.0) if inst == 'taiko' else (50.0, 1.2)
            P = self._p((inst, var % 6), lambda: taiko_parts(f0, size, 3000 + 17 * (var % 6) + (0 if inst == 'taiko' else 500)))
            y = (P['mem'] * vel ** 1.3 + 0.30 * P['strike'] * vel ** 2.2 + 0.22 * P['slap'] * vel ** 1.8
                 + 0.14 * P['body'] * vel ** 1.3)
            return sat(fade(y, 0.0, 0.03), 1.2)
        if inst == 'boom':
            size = kw.get('size', 1.0)
            return self._p(('boom', size, var % 3), lambda: boom_parts(size, 4000 + var % 3))['y'] * vel
        if inst == 'snare':
            P = self._p(('snare', var % 10), lambda: snare_parts(5000 + 13 * (var % 10)))
            n = len(P['shell'])
            roll = kw.get('roll', False)
            rim = 1.8 if kw.get('rim') else 1.0
            ew = env(n, 0.0006, (0.05 if roll else 0.09) + 0.08 * vel)
            y = (0.55 * rim ** 0.5 * P['shell'] * vel ** 1.2 + 0.30 * P['wires'] * ew * vel ** 1.4
                 + 0.12 * P['wires_lo'] * env(n, 0.0005, 0.03) * vel ** 1.2 + 0.35 * rim * P['click'] * vel ** 2)
            return fade(y, 0.0, 0.03)
        if inst == 'tom':
            f0 = TOMS[kw.get('which', 'low')]
            return self._p(('tom', f0, var % 4), lambda: tom_parts(f0, 6000 + 7 * (var % 4) + int(f0)))['y'] * vel ** 1.3
        if inst == 'rim':
            return self._p(('rim', var % 4), lambda: rim_parts(7000 + var % 4))['y'] * vel ** 1.3
        if inst == 'crash':
            return self._p(('crash', 0), lambda: crash_parts(7100))['y'] * vel
        raise ValueError(inst)


def bt(bar, beat=0.0):
    return GRID0 + bar * BAR + beat * BEAT


class DrumScore:
    """Event list; duplicates (same instrument within 2 ms) keep the loudest. Off-beat notes get ±2.5 ms feel."""

    def __init__(self):
        self.ev = {}
        self.r = rng(777)

    def add(self, t, inst, vel, pan=0.0, exact=False, **kw):
        bp_ = (t - GRID0) / BEAT
        if not exact and abs(bp_ - round(bp_)) > 1e-6:
            t += float(np.clip(self.r.normal(0, 0.0025), -0.006, 0.006))
        key = (inst, kw.get('which'), kw.get('layer'), int(round(t * 500)))
        if key in self.ev and self.ev[key][2] >= vel:
            return
        self.ev[key] = (t, inst, min(vel, 1.0), pan, kw)

    def taiko(self, t, v, pan=None):
        if pan is None:
            pan = [-0.35, 0.3, -0.15, 0.2][int(round((t - GRID0) / 0.3)) % 4]
        self.add(t, 'taiko', v, pan)

    def odaiko(self, t, v):
        self.add(t, 'odaiko', v, 0.0)

    def boom(self, t, v, size=1.0):
        self.add(t, 'boom', v, 0.0, size=size)

    def snare(self, t, v, flam=False, rim=False, pan=0.12):
        self.add(t, 'snare', v, pan, rim=rim)
        if flam and any(abs(t - c) < 0.002 for c, _ in HIT_CUES):
            flam = False                     # no grace note ahead of a sync cue: the first transient must be on time
        if flam:
            self.add(t - 0.022, 'snare', v * 0.35, pan - 0.05, exact=True)

    def tom(self, t, v, which='low'):
        self.add(t, 'tom', v, {'hi': -0.4, 'mid': -0.15, 'low': 0.15, 'floor': 0.4}[which], which=which)

    def rim(self, t, v):
        self.add(t, 'rim', v, 0.25)

    def crash(self, t, v):
        self.add(t, 'crash', v, 0.0)

    def roll(self, t0, t1, v0, v1, rate=22.0):
        """Single-stroke field-drum roll with exponential crescendo (in dB); last stroke just before t1."""
        k = int((t1 - t0) * rate)
        for i in range(k):
            p = i / max(1, k - 1)
            v = 10 ** ((20 * np.log10(v0) + (20 * np.log10(v1) - 20 * np.log10(v0)) * p ** 1.3) / 20)
            v *= 1.0 if i % 2 == 0 else 0.88
            tt = t0 + i / rate + float(np.clip(self.r.normal(0, 0.0012), -0.003, 0.003))
            self.add(max(t0, tt), 'snare', v, 0.12 + (0.04 if i % 2 else -0.04), exact=True, roll=True,
                     _i=i)   # _i keeps roll strokes distinct

    def ensemble(self, t, v=1.0, crash=False, toms=False, size=1.0, flam=True):
        self.boom(t, v, size)
        self.odaiko(t, v)
        self.taiko(t, v, -0.3)
        self.add(t, 'taiko', v * 0.95, 0.3, layer=1)
        self.snare(t, v * 0.95, flam=flam)
        if toms:
            for w in ('mid', 'low', 'floor'):
                self.tom(t, v * 0.8, w)
        if crash:
            self.crash(t, v)

    def events(self):
        return sorted(self.ev.values(), key=lambda e: e[0])


MARCH_A = [0.95, 0, 0.25, 0.3, 0.8, 0, 0.3, 0, 0.95, 0.25, 0.3, 0, 0.85, 0, 0.5, 0.6]
MARCH_B = [1.0, 0.3, 0.35, 0.3, 0.85, 0.3, 0.4, 0.3, 1.0, 0.3, 0.35, 0.3, 0.9, 0.45, 0.6, 0.75]


def march(S, bar, pat, scale, flams=(0, 8), upto=16):
    for i, v in enumerate(pat[:upto]):
        if v > 0:
            S.snare(bt(bar, i * 0.25), v * scale, flam=(i in flams and v > 0.7))


def tom_fill(S, bar, beat=3.0, scale=1.0):
    for i, (w, v) in enumerate(zip(('hi', 'mid', 'low', 'floor'), (0.7, 0.75, 0.85, 0.95))):
        S.tom(bt(bar, beat + 0.25 * i), v * scale, w)


def drum_score():
    S = DrumScore()
    # ---------- S2 (6.0–12.0): sparse, majestic
    S.ensemble(6.0, 1.0, toms=True, size=1.2, flam=False)
    S.taiko(6.6, 0.85, 0.25); S.snare(6.6, 0.7, flam=True)
    S.taiko(7.2, 0.45); S.taiko(7.8, 0.55); S.taiko(8.1, 0.4)
    S.boom(8.4, 0.8); S.odaiko(8.4, 0.85)
    S.taiko(9.6, 0.6); S.taiko(9.9, 0.4)
    S.taiko(10.2, 0.85); S.tom(10.2, 0.6, 'floor')
    S.boom(10.8, 0.85); S.odaiko(10.8, 0.85)
    S.roll(11.4, 12.0, 0.12, 0.8)
    # ---------- S3 (12.0–24.0): half-time march, building
    S.taiko(12.0, 0.95); S.odaiko(12.0, 0.8); S.snare(12.0, 0.8, flam=True)
    S.taiko(12.6, 0.5)
    for j, bar in enumerate((3, 4, 5)):                 # 13.2, 15.6, 18.0
        lv = (0.72, 0.8, 0.88)[j]
        S.boom(bt(bar), 0.7 * lv); S.odaiko(bt(bar), lv)
        S.snare(bt(bar, 1), 0.5 * lv, rim=True)
        S.taiko(bt(bar, 2), 0.7 * lv)
        S.snare(bt(bar, 3), 0.6 * lv, flam=True)
        S.taiko(bt(bar, 3.5), 0.45 * lv)
        if j >= 1:
            for g in (0.75, 1.75, 2.75):
                S.snare(bt(bar, g), 0.16)
            S.rim(bt(bar, 2.5), 0.4)
        if j == 2:
            S.taiko(bt(bar, 1.5), 0.5); S.taiko(bt(bar, 2.5), 0.5)
    S.taiko(14.4, 0.95); S.tom(14.4, 0.7, 'floor')                      # flyby peak
    S.taiko(15.0, 0.9); S.snare(15.0, 0.75, flam=True)                  # lower-third
    S.taiko(16.2, 0.75)
    S.boom(18.6, 0.9); S.odaiko(18.6, 0.95); S.taiko(18.6, 0.9, -0.3); S.add(18.6, 'taiko', 0.9, 0.3, layer=1)  # afterburners
    # bar 6 (20.4–22.8): lock tension
    S.boom(20.4, 0.7); S.odaiko(20.4, 0.7)
    for i in range(1, 4):
        S.tom(20.4 + 0.3 * i, 0.25 + 0.05 * i, 'floor')
    S.taiko(21.6, 0.85); S.odaiko(21.6, 0.7); S.tom(21.9, 0.4, 'low')
    S.taiko(22.2, 0.9); S.snare(22.2, 0.8, flam=True)
    # bar 7 (22.8–25.2)
    S.boom(22.8, 0.85); S.odaiko(22.8, 0.85); S.taiko(23.1, 0.5)
    S.roll(23.4, 24.0, 0.18, 0.9)
    S.taiko(24.0, 0.95); S.odaiko(24.0, 0.85); S.tom(24.0, 0.7, 'floor'); S.snare(24.0, 0.85, flam=True)
    S.taiko(24.6, 0.7); S.taiko(24.9, 0.5)
    # ---------- S4 (24.0–34.0): driving
    TP4 = [0.8, 0.5, 0.75, 0.55, 0.9, 0.5, 0.75, 0.6]
    for bar in (8, 9, 10):                               # 25.2, 27.6, 30.0
        S.boom(bt(bar), 0.9); S.odaiko(bt(bar), 0.9)
        for i, v in enumerate(TP4):
            S.taiko(bt(bar, 0.5 * i), v)
        march(S, bar, MARCH_A, 0.75)
    tom_fill(S, 9, 3.0)
    S.ensemble(27.0, 0.95)                               # cannon 1
    S.taiko(28.2, 0.85)                                  # helicopters enter
    S.ensemble(30.6, 0.95)                               # cannon 2
    S.ensemble(31.8, 1.0, toms=True)                     # «أرضٌ لا تُمَسّ»
    S.boom(32.4, 0.9); S.odaiko(32.4, 0.9)               # bar 11: drive, roll, break
    for i, v in enumerate(TP4[:4]):
        S.taiko(bt(11, 0.5 * i), v)
    march(S, 11, MARCH_A, 0.75, upto=4)
    S.roll(33.0, 33.6, 0.3, 0.95)
    S.taiko(33.6, 1.0); S.odaiko(33.6, 0.9)              # dust whoosh
    S.taiko(34.2, 0.8); S.boom(34.2, 0.6); S.rim(34.2, 0.8)   # glitch
    # ---------- S5 (34.8–42.0): tense, techy drive
    for j, bar in enumerate((12, 13, 14)):               # 34.8, 37.2, 39.6
        S.boom(bt(bar), 0.75); S.odaiko(bt(bar), 0.75)
        for i in range(8):
            S.taiko(bt(bar, 0.5 * i), 0.38 + (0.12 if i % 2 == 0 else 0.0) + 0.04 * j)
        S.snare(bt(bar, 1), 0.6, rim=True); S.snare(bt(bar, 3), 0.65, rim=True, flam=True)
        for i in range(16):
            S.rim(bt(bar, 0.25 * i), 0.35 if i % 2 == 0 else 0.2)
        S.tom(bt(bar, 2.5), 0.5, 'low')
        if j == 2:
            for g in (0.25, 0.75, 1.25, 1.75):
                S.snare(bt(bar, g), 0.2)
    for c in (36.0, 38.4):
        S.taiko(c, 0.85)
    S.ensemble(40.8, 0.9)                                # verdict
    S.taiko(41.4, 0.6); S.taiko(41.7, 0.75)
    S.roll(41.4, 42.0, 0.25, 1.0)
    # ---------- S6 (42.0–58.8): seven days, maximum
    TP6 = [1.0, 0.5, 0.7, 0.55, 0.9, 0.5, 0.75, 0.65]
    for d in range(1, 7):
        bar = 14 + d                                     # bars 15..20
        S.ensemble(bt(bar), 1.0, toms=(d >= 4), crash=(d >= 5))
        for i, v in enumerate(TP6):
            S.taiko(bt(bar, 0.5 * i), min(1.0, v * (0.85 + 0.03 * d)))
        if d >= 3:
            S.odaiko(bt(bar, 2), 0.8)
        march(S, bar, MARCH_B if d >= 3 else MARCH_A, 0.8 + 0.02 * d, flams=(0, 4, 8, 12) if d >= 3 else (0, 8))
        if d in (2, 4, 6):
            tom_fill(S, bar, 3.0, 0.9)
        if d >= 5:
            for k, x in enumerate((3.5, 3 + 2 / 3, 3 + 5 / 6)):
                S.taiko(bt(bar, x), 0.6 + 0.12 * k)
        if d >= 6:
            S.boom(bt(bar, 2.5), 0.6)
    # day 7 (bar 21, 56.4–58.8)
    S.ensemble(56.4, 1.0, toms=True, crash=True, size=1.4)
    S.taiko(57.0, 0.8); S.taiko(57.3, 0.6)
    S.roll(57.6, 58.8, 0.3, 1.0)
    for k, tt in enumerate((57.6, 57.9, 58.2, 58.5)):
        S.taiko(tt, 0.55 + 0.13 * k)
    for k, w in enumerate(('hi', 'mid', 'low')):
        S.tom(58.5 + 0.1 * k, 0.8 + 0.07 * k, w)
    S.taiko(58.8, 0.85); S.snare(58.8, 0.9, flam=True); S.odaiko(58.8, 0.6)
    # ---------- S7 finale
    S.roll(59.4, 59.86, 0.08, 0.8)                     # breath (silence) 59.86–60.0 before the HUGE hit
    S.ensemble(60.0, 1.0, toms=True, crash=True, size=1.5)
    S.ensemble(61.2, 0.85)
    S.odaiko(64.2, 0.55); S.boom(64.2, 0.5); S.taiko(64.2, 0.5)
    S.boom(66.0, 1.0, size=1.3); S.odaiko(66.0, 0.95); S.taiko(66.0, 0.8)
    return S.events()


CODA = 64.0          # drum events from here on (64.2 hit, 66.0 boom) bypass the «بإذن الله» mute


def drum_automation():
    t = tv(N)
    g = np.ones(N)
    g[t < GRID0] = 0.0                                                     # nothing before 6.0
    g *= np.interp(t, [0, 61.9, 62.4, 67], [1, 1, 0, 0])                   # silent under «بإذن الله» (62.4–64.2)
    # macro build (dB): restrained S2–S5, rising through the seven-day countdown to the maximum at day 7
    g *= 10 ** (np.interp(t, [0, 24.0, 24.6, 34.0, 34.8, 41.4, 42.0, 56.4, 58.8, 59.4, 67],
                          [-1.5, -1.5, -0.8, -0.8, -1.8, -1.8, 0.0, 1.5, 1.5, 0.5, 0.5]) / 20)
    return g


def drum_mask():
    """Where the drum stem may be non-zero (used for dither gating)."""
    t = tv(N)
    return (drum_automation() > 0) | (t >= 64.2)


def render_drums():
    kit = Kit()
    main, coda = Mixer(sends=('room', 'hall')), Mixer(sends=('room', 'hall'))
    for i, (t, inst, vel, pan, kw) in enumerate(drum_score()):
        sig = kit.render(inst, vel, i, **{k: v for k, v in kw.items() if not k.startswith('_') and k != 'layer'})
        (coda if t >= CODA else main).add(sig, t, INST_GAIN[inst], pan, **INST_SEND[inst])
    out = dc_block(main.render()[:N]) * drum_automation()[:, None] + dc_block(coda.render()[:N])
    pk = np.max(np.abs(out))
    return sat(out / pk, 1.4) * pk                               # tape-style glue on the drum bus


# ============================================================================================ mastering
def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return ss.lfilter(b2, a2, ss.lfilter(b1, a1, x, axis=0), axis=0)


def lufs_integrated(x):
    """ITU-R BS.1770-4 integrated loudness (stereo, 48 kHz)."""
    y = kweight(x)
    blk, hop = ns(0.4), ns(0.1)
    cs = np.vstack([np.zeros((1, 2)), np.cumsum(y * y, axis=0)])
    st = np.arange(0, len(y) - blk + 1, hop)
    z = ((cs[st + blk] - cs[st]) / blk).sum(axis=1)
    lk = -0.691 + 10 * np.log10(z + 1e-20)
    g1 = lk > -70
    if not np.any(g1):
        return -120.0
    rel = -0.691 + 10 * np.log10(z[g1].mean()) - 10
    g2 = g1 & (lk > rel)
    return float(-0.691 + 10 * np.log10(z[g2].mean()))


def true_peak_db(x):
    up = ss.resample_poly(x, 4, 1, axis=0)
    return float(20 * np.log10(max(np.max(np.abs(up)), np.max(np.abs(x))) + 1e-20))


def bus_compress(x, thr_db=-12.0, ratio=2.0, knee_db=6.0, att=0.025, rel=0.25, blk=48):
    """Gentle stereo-linked feed-forward compressor (block RMS detector, soft knee, dB-domain smoothing)."""
    n = len(x)
    nb = n // blk + 1
    xp = np.vstack([x, np.zeros((nb * blk - n, 2))])
    lvl = np.sqrt(np.mean(xp.reshape(nb, blk, 2) ** 2, axis=(1, 2)) * 2) + 1e-9
    over = 20 * np.log10(lvl) - thr_db
    slope = 1 / ratio - 1
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, slope * over, slope * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    aa, ar = np.exp(-blk / (att * SR)), np.exp(-blk / (rel * SR))
    g = np.empty(nb)
    s = 0.0
    for i in range(nb):
        v = gr[i]
        s = aa * s + (1 - aa) * v if v < s else ar * s + (1 - ar) * v
        g[i] = s
    gs = np.interp(np.arange(n), (np.arange(nb) + 0.5) * blk, 10 ** (g / 20))
    return x * gs[:, None], g


def limiter(x, ceiling_db=-1.5, look=0.003, rel=0.10, blk=16):
    """Look-ahead brick-wall limiter on the 4×-oversampled (true) peak; gain never exceeds the needed value."""
    c = 10 ** (ceiling_db / 20)
    n = len(x)
    up = np.abs(ss.resample_poly(x, 4, 1, axis=0))[:4 * n]
    tp = np.maximum(up.reshape(n, 4, 2).max(axis=(1, 2)), np.abs(x).max(axis=1))
    g_raw = np.minimum(1.0, c / np.maximum(tp, 1e-12))
    L = ns(look)
    nb = (n + blk - 1) // blk
    gb = np.pad(g_raw, (0, nb * blk - n), constant_values=1.0).reshape(nb, blk).min(axis=1)
    K = L // blk + 2
    gf = np.lib.stride_tricks.sliding_window_view(np.pad(gb, (0, K), constant_values=1.0), K + 1).min(axis=1)
    a = 1 - np.exp(-blk / (rel * SR))
    gr = np.empty(nb)
    s = 1.0
    for k in range(nb):
        v = gf[k]
        s = v if v < s else s + a * (v - s)
        gr[k] = s
    gs = np.repeat(gr, blk)[:n]
    h = L // 2
    for _ in range(2):                                   # two trailing moving averages (support < L)
        cs = np.cumsum(np.concatenate([np.ones(h), gs]))
        gs = (cs[h:h + n] - cs[:n]) / h
    return x * gs[:, None], gs


def final_fade():
    t = tv(N)
    w = np.ones(N)
    a, b = FADE_OUT
    m = (t >= a) & (t < b)
    w[m] = 0.5 + 0.5 * np.cos(np.pi * (t[m] - a) / (b - a))
    w[t >= b] = 0.0
    w *= ramp_in(N, 0.01)
    return w


def low_clip(x, thr_db=-7.0, fc=110.0):
    """Soft-clip only the sub band (zero-phase complementary split, perfect reconstruction when idle):
    tames sub-thump peaks that cost headroom but add little loudness; the tanh adds audible harmonics."""
    c = 10 ** (thr_db / 20)
    low = ss.sosfiltfilt(_sos('lowpass', fc, 2), x, axis=0)
    return x - low + c * np.tanh(low / c)


def dc_block(x, fc=5.0):
    """1st-order DC blocker y[n] = x[n] - x[n-1] + R*y[n-1] (removes offset created by the nonlinear stages)."""
    R = np.exp(-2 * np.pi * fc / SR)
    return ss.lfilter([1.0, -1.0], [1.0, -R], x, axis=0)


def master(x, name):
    x = hp(x, 30.0, 2)                                   # nothing useful below ~30 Hz on real playback systems
    x = x - x.mean(axis=0)
    fw = final_fade()[:, None]
    G = 10 ** ((TARGET_LUFS - lufs_integrated(x * fw)) / 20)
    ceil = TP_CEIL
    prev = None
    for it in range(12):
        y, gcomp = bus_compress(low_clip(x * G))
        y, glim = limiter(y, ceil)
        y = dc_block(y) * fw
        L = lufs_integrated(y)
        tp = true_peak_db(y)
        act = gcomp < -0.1
        print(f'  [{name}] iter {it}: gain {20 * np.log10(G):+.2f} dB  LUFS {L:.2f}  TP {tp:.2f} dBTP  '
              f'comp GR max {-gcomp.min():.1f} / median-active {-np.median(gcomp[act]) if act.any() else 0:.1f} dB  '
              f'lim GR max {-20 * np.log10(glim.min()):.1f} dB, >1 dB {np.mean(glim < 0.891) * 100:.1f}% of time')
        if tp > TP_CEIL + 0.05:
            ceil -= tp - TP_CEIL + 0.02
            continue
        if abs(L - TARGET_LUFS) < 0.05:
            break
        gdb = 20 * np.log10(G)
        slope = 1.0 if prev is None else np.clip((L - prev[1]) / (gdb - prev[0] + 1e-9), 0.25, 1.0)
        prev = (gdb, L)
        G = 10 ** ((gdb + (TARGET_LUFS - L) / slope) / 20)        # secant step (dynamics make dL/dG < 1)
    return y


def to_int16(y, seed, mask=None):
    r = rng(seed)
    d = r.random(y.shape) - r.random(y.shape)            # TPDF dither, ±1 LSB
    if mask is not None:
        d *= (mask > 0)[:, None]
    q = np.round(y * 32767.0 + d)
    return np.clip(q, -32767, 32767).astype(np.int16)


def write_wav(name, y, seed, mask=None):
    assert y.shape == (N, 2), y.shape
    path = os.path.join(OUT, name)
    wavfile.write(path, SR, to_int16(y, seed, mask))
    print(f'  wrote {path}')


# ============================================================================================ main
def main():
    t0 = time.time()
    print('rendering SFX stem …')
    sfx = render_sfx()
    print(f'  {time.time() - t0:.1f}s')
    print('rendering drum stem …')
    drums = render_drums()
    print(f'  {time.time() - t0:.1f}s')
    fw = final_fade()
    sfx *= fw[:, None]
    drums *= fw[:, None] * 10 ** (DRUM_DB / 20)
    # one shared stem gain so that sfx + drums (and each stem) peaks at −1 dBFS
    g = 10 ** (-1 / 20) / max(np.max(np.abs(sfx)), np.max(np.abs(drums)), np.max(np.abs(sfx + drums)))
    sfx *= g
    drums *= g
    write_wav('sfx.wav', sfx, 11, fw)
    write_wav('drums.wav', drums, 12, fw * drum_mask())
    print('mastering …')
    m1 = master(sfx, 'sfx-only')
    write_wav('mix_sfx_only.wav', m1, 13, fw)
    m2 = master(sfx + drums, 'full')
    write_wav('mix_full.wav', m2, 14, fw)
    print(f'done in {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
