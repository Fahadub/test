#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
check_audio.py — self-check for the «درع الوطن» soundtrack. Run after build_audio.py.

  (a) ffprobe: exact duration / sample rate / channels / codec of every output
  (b) onset detection (multi-band log-energy flux + envelope refinement) vs the cue sheet (±20 ms),
      plus an isolated-render timing check of the gradual cues (risers, whooshes, flybys, rotor, swell)
  (c) waveform.png + spectrogram.png of mix_full (ffmpeg showwavespic / showspectrumpic)
  (d) integrated loudness / true peak of both mixes measured by ffmpeg (ebur128 + loudnorm)
  + clipping, DC offset, digital silence at the end, drum silence where required.
Exit code 1 if any check fails.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np
import scipy.signal as ss
from scipy.io import wavfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_audio as B  # noqa: E402

SR = B.SR
FILES = ['sfx.wav', 'drums.wav', 'mix_sfx_only.wav', 'mix_full.wav']
FAILS = []


def fail(msg):
    FAILS.append(msg)
    print('  FAIL: ' + msg)


def load(name):
    sr, x = wavfile.read(os.path.join(HERE, name))
    assert sr == SR
    return x.astype(np.float64) / 32768.0


# ------------------------------------------------------------------------------------------ (a) ffprobe
def check_ffprobe():
    print('\n(a) ffprobe')
    for f in FILES:
        out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                              'stream=codec_name,sample_rate,channels,bits_per_sample,duration_ts,duration',
                              '-of', 'json', os.path.join(HERE, f)], capture_output=True, text=True, check=True).stdout
        s = json.loads(out)['streams'][0]
        ok = (s['codec_name'] == 'pcm_s16le' and int(s['sample_rate']) == 48000 and int(s['channels']) == 2
              and int(s['duration_ts']) == B.N and abs(float(s['duration']) - 67.0) < 1e-6)
        print(f"  {f:18s} {s['codec_name']}  {s['sample_rate']} Hz  {s['channels']} ch  {s['bits_per_sample']} bit  "
              f"{s['duration_ts']} frames  {float(s['duration']):.6f} s  {'OK' if ok else 'BAD'}")
        if not ok:
            fail(f'{f}: format/duration mismatch')


# ------------------------------------------------------------------------------------------ (b) onsets
BANDS = [(25, 120), (120, 400), (400, 1500), (1500, 5000), (5000, 16000)]
HOP, WIN = 96, 384


def onsets(x):
    """Return (times, strengths). Multi-band log-energy flux, peak picking, envelope-based refinement."""
    mono = x.mean(axis=1)
    nfr = (len(mono) - WIN) // HOP + 1
    flux = np.zeros((len(BANDS), nfr))
    bandsig = []
    for b, (lo, hi) in enumerate(BANDS):
        y = ss.sosfiltfilt(ss.butter(2, (lo, min(hi, 0.45 * SR)), 'bandpass', fs=SR, output='sos'), mono)
        bandsig.append(y)
        cs = np.concatenate([[0.0], np.cumsum(y * y)])
        st = np.arange(nfr) * HOP
        e = (cs[st + WIN] - cs[st]) / WIN
        L = 10 * np.log10(e + 1e-7)
        d = np.zeros(nfr)
        d[2:] = L[2:] - L[:-2]
        flux[b] = np.maximum(d, 0)
    S = flux.sum(axis=0)
    med = ss.medfilt(S, 251)
    times, strengths = [], []
    half = 15
    for k in range(half, nfr - half):
        if S[k] < 6.0 or S[k] < med[k] + 4.0:
            continue
        if S[k] != S[k - half:k + half + 1].max():
            continue
        tk = (k * HOP + WIN / 2) / SR
        # refine in the highest band that carries ≥40 % of the max band flux: low bands (zero-phase filtered)
        # pre-ring by ~±20 ms and cannot localise an onset that precisely
        b = int(np.nonzero(flux[:, k] >= 0.4 * flux[:, k].max())[0].max())
        a0, a1 = max(0, int((tk - 0.06) * SR)), int((tk + 0.06) * SR)
        seg = bandsig[b][a0:a1]
        env = np.sqrt(np.convolve(seg * seg, np.ones(48) / 48, mode='same'))      # 1 ms RMS envelope
        rise = np.diff(env)
        w0, w1 = int((tk - 0.03) * SR) - a0, int((tk + 0.02) * SR) - a0
        idx = w0 + int(np.argmax(rise[w0:w1]))                                   # steepest rise = the event
        pk = idx + int(np.argmax(env[idx:idx + int(0.03 * SR)]))
        lo = max(0, idx - int(0.015 * SR))
        base = env[lo:idx + 1].min()
        below = np.nonzero(env[lo:idx + 1] <= base + 0.2 * (env[pk] - base))[0]  # walk back to 20 % of the rise
        idx = lo + int(below[-1]) if len(below) else lo
        off = a0
        times.append((idx + off) / SR)
        strengths.append(float(S[k]))
    return np.array(times), np.array(strengths)


def cue_table(name, x, cues, tol=0.020, win=0.080):
    print(f'\n(b) onset detection on {name}: cue vs strongest detected transient within ±{win * 1000:.0f} ms')
    t_on, s_on = onsets(x)
    print(f'    {len(t_on)} onsets detected in total')
    print(f"    {'cue (s)':>8} {'detected':>9} {'Δ ms':>7} {'strength':>9}  result  label")
    worst = 0.0
    for tc, label in cues:
        m = np.abs(t_on - tc) <= win
        if not np.any(m):
            print(f'    {tc:8.3f} {"—":>9} {"—":>7} {"—":>9}  MISS    {label}')
            fail(f'{name}: no onset near {tc} ({label})')
            continue
        i = np.nonzero(m)[0][np.argmax(s_on[m])]
        dt = (t_on[i] - tc) * 1000
        ok = abs(dt) <= tol * 1000
        worst = max(worst, abs(dt))
        print(f'    {tc:8.3f} {t_on[i]:9.4f} {dt:+7.1f} {s_on[i]:9.1f}  {"PASS" if ok else "FAIL"}    {label}')
        if not ok:
            fail(f'{name}: cue {tc} ({label}) off by {dt:+.1f} ms')
    print(f'    worst |Δ| = {worst:.1f} ms')
    return t_on, s_on


def gradual_check():
    print('\n(b2) gradual cues, isolated dry render of each element (RMS envelope, 20 ms window)')
    print(f"    {'label':40s} {'first':>8} {'peak':>8} {'last>-35dB':>10}  result")
    evs = B.sfx_events()
    for tag, label, t_start, pk_lo, pk_hi, quiet_by in B.GRADUAL_CUES:
        sel = [e for e in evs if e['cue'] == tag]
        y = B.render_sfx(events=sel, reverb=False, bed=False).mean(axis=1)     # dry, incl. pre-hit ducking
        nz = np.nonzero(np.abs(y) > 1e-6)[0]
        first = nz[0] / SR
        w = int(0.02 * SR)
        cs = np.concatenate([[0.0], np.cumsum(y * y)])
        e = np.sqrt((cs[w:] - cs[:-w]) / w)
        tt = (np.arange(len(e)) + w / 2) / SR
        pk = tt[np.argmax(e)]
        db = 20 * np.log10(e / e.max() + 1e-12)
        last = tt[np.nonzero(db > -35)[0][-1]]
        ok = abs(first - t_start) <= 0.02
        if pk_lo is not None:
            ok &= pk_lo <= pk <= pk_hi
        if quiet_by is not None:
            ok &= last <= quiet_by
        print(f'    {label:40s} {first:8.3f} {pk:8.3f} {last:10.3f}  {"PASS" if ok else "FAIL"}')
        if not ok:
            fail(f'gradual cue {label}: first {first:.3f} peak {pk:.3f} last {last:.3f}')


def drum_grid_check(x):
    print('\n(b3) drums stem: scheduled on-beat accents (vel ≥ 0.6, 100 BPM grid) vs nearest detected onset')
    t_on, s_on = onsets(x)
    beats = sorted({round(t, 4) for (t, inst, vel, pan, kw) in B.drum_score()
                    if vel >= 0.6 and not kw.get('roll') and abs((t - B.GRID0) / B.BEAT - round((t - B.GRID0) / B.BEAT)) < 1e-6
                    and not (62.4 <= t < 64.2)})
    d = np.array([(t_on[np.argmin(np.abs(t_on - tb))] - tb) * 1000 for tb in beats])
    ok = np.abs(d) <= 20
    print(f'    {len(beats)} accented beats; Δ median {np.median(d):+.1f} ms, |Δ| 95th pct {np.percentile(np.abs(d), 95):.1f} ms, '
          f'within ±20 ms: {ok.mean() * 100:.1f}%')
    bad = [(b, round(v, 1)) for b, v, o in zip(beats, d, ok) if not o]
    if bad:
        print(f'    outside ±20 ms: {bad[:10]}')
    if ok.mean() < 0.95:
        fail('drums: fewer than 95% of accented beats within ±20 ms')
    early = t_on[t_on < 5.99]
    if len(early):
        fail(f'drums: onsets before 6.0: {early[:5]}')


# ------------------------------------------------------------------------------------------ (d) loudness
def ffmpeg_loudness(name):
    path = os.path.join(HERE, name)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True)
    txt = r.stderr[r.stderr.rfind('Summary:'):]
    I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', txt).group(1))
    LRA = float(re.search(r'LRA:\s+(-?[\d.]+) LU', txt).group(1))
    TP = float(re.search(r'True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS', txt).group(1))
    r2 = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af',
                         'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'],
                        capture_output=True, text=True)
    js = json.loads(r2.stderr[r2.stderr.rfind('{'):r2.stderr.rfind('}') + 1])
    return I, LRA, TP, float(js['input_i']), float(js['input_tp'])


def check_levels():
    print('\n(d) loudness / peaks')
    for f in FILES:
        x = load(f)
        pk = np.max(np.abs(x))
        clip = int(np.sum(np.abs(x) >= 32767 / 32768))
        dc = x.mean(axis=0)
        tail = x[-int(0.02 * SR):]
        line = (f'  {f:18s} sample peak {20 * np.log10(pk):6.2f} dBFS  clipped samples {clip}  '
                f'DC L {dc[0]:+.1e} R {dc[1]:+.1e}  last 20 ms all-zero: {not np.any(tail)}')
        print(line)
        if clip:
            fail(f'{f}: clipping')
        if np.any(np.abs(dc) > 2e-4):
            fail(f'{f}: DC offset')
        if np.any(tail):
            fail(f'{f}: not digital silence at the end')
    for f in ('mix_sfx_only.wav', 'mix_full.wav'):
        I, LRA, TP, I2, TP2 = ffmpeg_loudness(f)
        ok = abs(I - B.TARGET_LUFS) <= 0.5 and TP <= -1.0 and TP2 <= -1.0
        print(f'  {f:18s} ffmpeg ebur128: I {I:.1f} LUFS  LRA {LRA:.1f} LU  true peak {TP:.1f} dBTP | '
              f'loudnorm: input_i {I2:.2f} LUFS  input_tp {TP2:.2f} dBTP  {"OK" if ok else "BAD"}')
        if not ok:
            fail(f'{f}: loudness/true-peak out of spec')
    d = load('drums.wav')
    t = np.arange(len(d)) / SR
    pre = d[t < 5.99]
    hole = d[(t > 62.45) & (t < 64.19)]
    print(f'  drums.wav before 6.0: max |x| = {np.max(np.abs(pre)):.2e}; under «بإذن الله» 62.45–64.19: '
          f'max |x| = {np.max(np.abs(hole)):.2e}')
    if np.max(np.abs(pre)) > 0 or np.max(np.abs(hole)) > 1e-4:
        fail('drums: not silent where required')


def section_table():
    print('\n    short-term loudness per section (pre-master stems, LUFS, 3 s windows → max / median)')
    sfx, dr = load('sfx.wav'), load('drums.wav')
    secs = [('S1 intro', 0, 6), ('S2 flag', 6, 12), ('S3 air', 12, 24), ('S4 ground', 24, 34),
            ('S5 analysis', 34, 42), ('S6 7 days', 42, 58.8), ('S7 finale', 58.8, 67)]

    def st_loud(x):
        y = B.kweight(x)
        w = int(3 * SR)
        h = int(0.1 * SR)
        cs = np.vstack([np.zeros((1, 2)), np.cumsum(y * y, axis=0)])
        st = np.arange(0, len(y) - w, h)
        z = ((cs[st + w] - cs[st]) / w).sum(axis=1)
        return (st + w / 2) / SR, -0.691 + 10 * np.log10(z + 1e-20)

    ts, ls = st_loud(sfx)
    td, ld = st_loud(dr)
    for name, a, b in secs:
        m = (ts >= a) & (ts < b)
        print(f'    {name:12s} sfx max {ls[m].max():6.1f} med {np.median(ls[m]):6.1f} | '
              f'drums max {ld[m].max():6.1f} med {np.median(ld[m]):6.1f}')


# ------------------------------------------------------------------------------------------ (c) pictures
def pictures():
    print('\n(c) waveform.png / spectrogram.png of mix_full.wav')
    src = os.path.join(HERE, 'mix_full.wav')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-filter_complex',
                    'showwavespic=s=2000x500:split_channels=1:colors=0x7CFFB2|0xC8A24A:scale=lin,'
                    'drawgrid=w=2000/67*6:h=0:color=white@0.25',
                    '-frames:v', '1', os.path.join(HERE, 'waveform.png')], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-lavfi',
                    'showspectrumpic=s=2000x600:mode=combined:color=intensity:scale=log:fscale=log:legend=1',
                    os.path.join(HERE, 'spectrogram.png')], check=True)
    print('  wrote audio/waveform.png, audio/spectrogram.png')


def main():
    check_ffprobe()
    sfx_only = load('mix_sfx_only.wav')
    full = load('mix_full.wav')
    cue_table('mix_sfx_only.wav', sfx_only, B.HIT_CUES)
    cue_table('mix_full.wav', full, B.HIT_CUES)
    gradual_check()
    drum_grid_check(load('drums.wav'))
    check_levels()
    section_table()
    pictures()
    print('\nRESULT: ' + ('ALL CHECKS PASSED' if not FAILS else f'{len(FAILS)} FAILURE(S)'))
    for f in FAILS:
        print('  - ' + f)
    sys.exit(1 if FAILS else 0)


if __name__ == '__main__':
    main()
