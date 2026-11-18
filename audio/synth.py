#!/usr/bin/env python3
"""Maayer Obosor: synthesized score + SFX, timed to sentences.json. Output: music.wav, sfx.wav, (stereo, 48 kHz)."""
import json, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 5314 / 30.0                      # exact video length
N = int(round(DUR * SR))
rng = np.random.default_rng(7)
S = json.load(open('../sentences.json'))
st = lambda i: S[i]['start']
en = lambda i: S[i]['end']

# ---------------------------------------------------------------- helpers
def sec(x): return int(round(x * SR))
def lp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, f1, f2, o=2): return signal.sosfilt(signal.butter(o, [f1, f2], 'band', fs=SR, output='sos'), x)
def noise(n): return rng.standard_normal(n)
def pink(n):
    w = noise(n); X = np.fft.rfft(w); f = np.fft.rfftfreq(n); f[0] = f[1]
    p = np.fft.irfft(X / np.sqrt(f), n); return p / (np.std(p) + 1e-9)
def env_ar(n, a, r, curve=2.0):
    e = np.ones(n); na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)[:n] ** 1
    if nr < n: e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e
def expdec(n, tau): return np.exp(-np.arange(n) / (tau * SR))

L = np.zeros(N); R = np.zeros(N)      # sfx bus
ML = np.zeros(N); MR = np.zeros(N)    # music bus
CUES = []

def put(bus, x, t, gain=1.0, pan=0.0):
    """add mono x at time t (s); pan -1..1 (equal-power)"""
    i = sec(t)
    if i >= N or i + len(x) <= 0: return
    a = max(0, -i); b = min(len(x), N - i)
    g = gain; l = g * np.cos((pan + 1) * np.pi / 4); r = g * np.sin((pan + 1) * np.pi / 4)
    busL, busR = bus
    busL[i + a:i + b] += x[a:b] * l; busR[i + a:i + b] += x[a:b] * r
SFX = (L, R); MUS = (ML, MR)

def cue(t, name, gain, note=''):
    CUES.append({'t': round(t, 2), 'frame': int(round(t * 30)), 'name': name, 'gain_db': round(20 * np.log10(max(gain, 1e-6)), 1), 'note': note})

def reverb(x, rt=0.8, wet=0.25, hf=6000):
    n = int(rt * SR); ir = noise(n) * expdec(n, rt / 5.5); ir = lp(ir, hf, 1); ir[0] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    y = signal.fftconvolve(x, ir)[:len(x)]
    return x * (1 - wet) + y * wet * 2.0

def sweep(f0, f1, n, curve=1.0):
    u = np.linspace(0, 1, n) ** curve; f = f0 + (f1 - f0) * u
    return np.sin(2 * np.pi * np.cumsum(f) / SR)

def tone_ring(freqs, amps, taus, n):
    t = np.arange(n) / SR; y = np.zeros(n)
    for f, a, tau in zip(freqs, amps, taus): y += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    return y

# ---------------------------------------------------------------- SFX generators (mono, ~unit scale)
def rain_bed(dur, kind='tin', dens=1.0):
    n = sec(dur); base = bp(pink(n), 300, 7000, 2) * 0.5
    drops = np.zeros(n); k = int(dur * 220 * dens)
    for p in rng.integers(0, n, k):
        m = min(220, n - p); drops[p:p + m] += rng.uniform(0.2, 1.0) * expdec(m, 0.0015) * rng.standard_normal(m)
    if kind == 'tin':      # corrugated sheet: ringing high band + clatter
        ring = np.zeros(n); k2 = int(dur * 70 * dens)
        for p in rng.integers(0, n - 4000, k2):
            m = 3500; ring[p:p + m] += rng.uniform(0.2, 1) * tone_ring([rng.uniform(1500, 3600), rng.uniform(3600, 6200)], [1, .5], [0.012, 0.007], m)
        y = base * 0.7 + hp(drops, 1500) * 0.5 + ring * 0.9
    elif kind == 'ground':  # puddles / earth
        y = lp(base, 4500) * 0.9 + lp(drops, 3000) * 0.4
    else:                   # pucca roof: softer, duller
        y = lp(base, 3500) * 0.8 + lp(drops, 3500) * 0.25
    return y / (np.std(y) + 1e-9)

def thunder(dur=5.0):
    n = sec(dur); x = lp(noise(n), 130, 3); e = (1 - np.exp(-np.arange(n) / (0.7 * SR))) * expdec(n, 1.4)
    rum = lp(noise(n), 60, 2) * np.abs(np.sin(2 * np.pi * 0.7 * np.arange(n) / SR + 1)) ** 2
    y = (x + 0.8 * rum) * e; return y / (np.max(np.abs(y)) + 1e-9)

def drip(f=820):
    n = sec(0.5); t = np.arange(n) / SR
    plop = np.sin(2 * np.pi * np.cumsum(np.linspace(f * 1.6, f, n)) / SR) * expdec(n, 0.03)
    ring = tone_ring([f * 2.6, f * 4.1, f * 5.9], [.5, .3, .15], [0.09, 0.05, 0.03], n)   # metal pot
    return (plop * .8 + ring * .6) * np.minimum(1, t * 3000)

def dheki():
    n = sec(0.9); t = np.arange(n) / SR
    th = np.sin(2 * np.pi * 70 * t) * expdec(n, 0.09) + 0.4 * np.sin(2 * np.pi * 138 * t) * expdec(n, 0.05)
    cl = lp(noise(n), 900) * expdec(n, 0.015); wood = tone_ring([310, 520], [.3, .2], [0.05, 0.03], n)
    y = th + cl * .8 + wood; return y / np.max(np.abs(y))

def thump_soft():
    n = sec(0.5); t = np.arange(n) / SR; y = np.sin(2 * np.pi * 55 * t) * expdec(n, 0.07); return y

def bird(kind=0):
    n = sec(rng.uniform(0.25, 0.7)); out = np.zeros(n); p = 0
    while p < n - 2000:
        m = int(rng.uniform(0.05, 0.13) * SR); m = min(m, n - p)
        f0 = rng.uniform(2400, 4800); f1 = f0 * rng.uniform(0.6, 1.5)
        out[p:p + m] += sweep(f0, f1, m, rng.uniform(.6, 1.6)) * np.sin(np.linspace(0, np.pi, m)) ** 1.5
        p += m + int(rng.uniform(0.02, 0.08) * SR)
    return out * 0.6

def crow():
    n = sec(0.55); f = 480 + 80 * np.sin(np.linspace(0, 3, n))
    saw = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR); y = bp(saw, 600, 2200, 2) * np.sin(np.linspace(0, np.pi, n)) ** 0.7
    return y * 0.6

def _crickets(dur):
    n = sec(dur); t = np.arange(n) / SR; y = np.zeros(n)
    for f0, rate, ph in [(4300, 31, 0.0), (4700, 27, 1.3), (3900, 24, 2.2)]:
        am = np.clip(np.sin(2 * np.pi * rate * t + ph), 0, 1) ** 2
        gate = (np.sin(2 * np.pi * (0.35 + 0.07 * rate / 30) * t + ph * 3) > -0.1).astype(float)
        gate = lp(gate, 5, 1); y += np.sin(2 * np.pi * f0 * t) * am * gate * 0.3
    return y

def _wind(dur, lo=200, hi=1400):
    n = sec(dur); x = bp(pink(n), lo, hi, 2); m = 0.55 + 0.45 * np.sin(2 * np.pi * np.arange(n) / SR / rng.uniform(5, 8) + rng.uniform(0, 6)); return x * m

def foot_gravel():
    n = sec(0.22); x = bp(noise(n), 700, 5000, 2) * expdec(n, 0.045) + 0.5 * lp(noise(n), 300) * expdec(n, 0.03); return x

def page_turn():
    n = sec(0.45); x = bp(noise(n), 1500, 7000, 2) * (np.sin(np.linspace(0, np.pi, n)) ** 2) * (0.6 + 0.4 * noise(n).clip(-1, 1)); return x * 0.7

def scratch(dur):
    n = sec(dur); x = bp(noise(n), 2500, 8000, 2); m = np.abs(lp(noise(n), 14, 1)); m = m / m.max(); return x * m ** 1.5 * np.minimum(1, np.arange(n) / 2000)

def cloth(dur, lo=400, hi=3500):
    n = sec(dur); x = bp(noise(n), lo, hi, 2); m = np.sin(np.linspace(0, np.pi, n)) ** 1.5 * (0.7 + 0.3 * lp(noise(n), 25, 1) / 0.3); return x * np.abs(m)

def needle_sew(dur):
    n = sec(dur); out = np.zeros(n); t = 0.0
    while t < dur - 0.3:
        c = cloth(0.25, 1800, 6000) * 0.6; p = sec(t); m = min(len(c), n - p)
        if m > 0: out[p:p + m] += c[:m]
        t += rng.uniform(0.9, 1.5)
    return out

def plate_clink():
    n = sec(0.7); return tone_ring([2300, 3650, 5400, 880], [1, .7, .4, .3], [0.12, 0.07, 0.04, 0.2], n) * np.minimum(1, np.arange(n) / 40)

def glass_clink():
    n = sec(0.9); return tone_ring([2750, 5400, 7900], [1, .5, .25], [0.35, 0.2, 0.1], n) * np.minimum(1, np.arange(n) / 30)

def pour(dur):
    n = sec(dur); x = bp(noise(n), 500, 3500, 2); mod = 0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(900 + 700 * lp(noise(n), 6, 1) / 0.3) / SR / 2.5); return x * mod * env_ar(n, .08, .25)

def lid_scrape(dur=0.9):
    n = sec(dur); x = bp(noise(n), 300, 2600, 2); f = (0.5 + 0.5 * np.sin(np.linspace(0, 5, n))); return x * f * np.sin(np.linspace(0, np.pi, n)) + lp(noise(n), 200) * 0.4 * expdec(n, 0.3)

def tin_hollow():     # empty rice tin tapped
    n = sec(0.8); return tone_ring([190, 410, 760], [1, .6, .3], [0.18, 0.1, 0.06], n) * np.minimum(1, np.arange(n) / 30)

def bangles(nc=7, dur=1.3):
    n = sec(dur); out = np.zeros(n)
    for k in range(nc):
        p = sec(k * rng.uniform(0.02, 0.08) + rng.uniform(0, 0.06)); m = min(sec(0.5), n - p)
        out[p:p + m] += rng.uniform(.4, 1) * tone_ring([rng.uniform(3000, 3900), rng.uniform(5200, 7000), rng.uniform(8000, 9500)], [1, .6, .3], [0.18, 0.1, 0.06], m)
    return out * np.minimum(1, np.arange(n) / 20) * expdec(n, 0.6)

def key_jingle():
    n = sec(1.1); out = np.zeros(n)
    for k, d in enumerate([0, 0.05, 0.12, 0.2, 0.3]):
        p = sec(d); m = min(sec(0.6), n - p)
        out[p:p + m] += (1 - 0.12 * k) * tone_ring([rng.uniform(2800, 3400), rng.uniform(4600, 5600), rng.uniform(7000, 8500)], [1, .55, .25], [0.15, 0.09, 0.05], m)
    return out

def coin_press():
    n = sec(0.5); return tone_ring([4200, 6300], [1, .5], [0.05, 0.03], n) + 0.3 * cloth(0.5, 500, 3000)[:n]

def bus_engine(dur, pass_t):
    n = sec(dur); t = np.arange(n) / SR
    near = np.exp(-((t - pass_t) / (dur * 0.28)) ** 2)
    f = 42 + 10 * np.sin(2 * np.pi * 7 * t)
    d = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * 0.7 + lp(noise(n), 400) * 0.7
    d = lp(d, 700 + 800 * near, 2) if False else lp(d, 900, 2)
    return d * (0.12 + 0.88 * near)

def horn(two=True, dur=0.5):
    n = sec(dur); t = np.arange(n) / SR
    y = signal.square(2 * np.pi * 410 * t) * 0.5 + signal.square(2 * np.pi * 520 * t) * 0.5
    y = lp(y, 2500, 2) * env_ar(n, 0.01, 0.06, 1.0); return y

def rickshaw_bell(k=3):
    n = sec(1.0 + 0.12 * k); out = np.zeros(n)
    for j in range(k):
        p = sec(j * 0.11); m = min(sec(0.9), n - p); out[p:p + m] += tone_ring([2600, 3900, 5100, 6800], [1, .6, .4, .2], [0.5, 0.25, 0.15, 0.1], m)
    return out * np.minimum(1, np.arange(n) / 20)

def _babble(dur, lo=250, hi=3200):
    n = sec(dur); x = np.zeros(n)
    for _ in range(6):
        f0 = rng.uniform(110, 210); saw = signal.sawtooth(2 * np.pi * np.cumsum(f0 * (1 + 0.15 * lp(noise(n), 3, 1) / 0.2)) / SR)
        syl = np.clip(lp(noise(n), 4, 1) * 6, 0, 1) ** 2; x += bp(saw, 400, 2500, 2) * syl
    return bp(x, lo, hi, 1)

def _city_rumble(dur): n = sec(dur); return lp(pink(n), 900, 2) * 0.9

def key_clicks(dur, rate=6):
    n = sec(dur); out = np.zeros(n); t = 0.0
    while t < dur - 0.1:
        m = sec(0.03); p = sec(t); out[p:p + m] += hp(noise(m), 2500) * expdec(m, 0.006) * rng.uniform(.4, 1); t += rng.exponential(1 / rate) + 0.04
    return out

def phone_ring(reps=3):
    n = sec(0.9 * reps); out = np.zeros(n)
    for r in range(reps):
        for k in range(2):
            p = sec(r * 0.9 + k * 0.22); m = sec(0.16); t = np.arange(m) / SR
            out[p:p + m] += (np.sin(2 * np.pi * 880 * t) + 0.6 * np.sin(2 * np.pi * 1320 * t)) * np.sin(np.linspace(0, np.pi, m)) ** 0.6
    return lp(out, 6000, 1) * 0.6

def phone_buzz(dur=1.2):
    n = sec(dur); t = np.arange(n) / SR; gate = (np.sin(2 * np.pi * 2.0 * t) > 0).astype(float); return lp(signal.square(2 * np.pi * 160 * t) * 0.5 + noise(n) * 0.1, 900) * lp(gate, 30, 1)

def heartbeat(beats, bpm=60):
    n = sec(beats * 60 / bpm); out = np.zeros(n)
    for b in range(beats):
        for d, g in ((0, 1), (0.26, 0.65)):
            p = sec(b * 60 / bpm + d); m = min(sec(0.25), n - p); t = np.arange(m) / SR
            out[p:p + m] += g * np.sin(2 * np.pi * 55 * t) * expdec(m, 0.06)
    return out

def laugh_breath():   # soft exhale of a tired smile
    n = sec(0.8); return bp(noise(n), 500, 3000, 2) * np.sin(np.linspace(0, np.pi, n)) ** 2 * 0.5

def notes_count(n_notes=5):
    n = sec(0.2 * n_notes + 0.3); out = np.zeros(n)
    for k in range(n_notes):
        p = sec(0.04 + k * 0.19); m = min(sec(0.16), n - p)
        out[p:p + m] += hp(noise(m), 2200) * expdec(m, 0.03) * rng.uniform(.6, 1) + 0.3 * bp(noise(m), 700, 2500, 1) * expdec(m, 0.05)
    return out

def machine_hum(dur):
    n = sec(dur); t = np.arange(n) / SR
    y = np.sin(2 * np.pi * 100 * t) * 0.5 + np.sin(2 * np.pi * 200 * t + 1) * 0.25 + lp(noise(n), 500, 1) * 0.25
    return y * (0.85 + 0.15 * np.sin(2 * np.pi * 0.7 * t))

def metal_clink():
    n = sec(0.6); return tone_ring([1900, 3300, 5200, 7600], [1, .7, .4, .2], [0.09, 0.05, 0.03, 0.02], n) * np.minimum(1, np.arange(n) / 25)

def thread_tug():
    n = sec(0.5); return bp(noise(n), 2500, 8000, 2) * np.sin(np.linspace(0, np.pi, n)) ** 3 * 0.6

def sniff():
    n = sec(0.35); return bp(noise(n), 1200, 5000, 2) * np.sin(np.linspace(0, np.pi, n)) ** 2

def _lamp_flicker(dur):
    n = sec(dur); x = bp(noise(n), 800, 2200, 1) * 0.08; return x * (0.5 + 0.5 * np.abs(lp(noise(n), 8, 1)) / 0.15)

def blanket(dur=1.2): return cloth(dur, 200, 1800)

def hug_cloth(): return cloth(1.4, 250, 2600) * 0.9

def water_splash(): n = sec(0.9); return bp(noise(n), 300, 4500, 2) * expdec(n, 0.2) * np.minimum(1, np.arange(n) / 50)

def pulley(dur=1.4):
    n = sec(dur); t = np.arange(n) / SR; x = tone_ring([430, 880], [.4, .2], [2, 2], n) * 0.1 * (np.sin(2 * np.pi * 3.2 * t) > 0) + lp(noise(n), 700) * 0.25
    return x * np.sin(np.linspace(0, np.pi, n))

def door_creak(dur=0.9):
    n = sec(dur); f = 180 + 120 * np.sin(np.linspace(0, 2.2, n)) + 20 * lp(noise(n), 40, 1) / 0.2
    return bp(signal.sawtooth(2 * np.pi * np.cumsum(f) / SR), 300, 1800, 2) * np.sin(np.linspace(0, np.pi, n))

def umbrella_absent():  # nothing; the missing umbrella is silence. A hanger peg ticks once.
    n = sec(0.2); return tone_ring([1400, 2900], [1, .4], [0.04, 0.02], n)

def _unit(f):
    def g(*a, **k):
        y = f(*a, **k); return y / (np.std(y) + 1e-9)
    return g
wind = _unit(_wind); crickets = _unit(_crickets); city_rumble = _unit(_city_rumble); babble = _unit(_babble); lamp_flicker = _unit(_lamp_flicker)

# ---------------------------------------------------------------- SFX placement (times follow sentences.json)
def bed(x, t0, t1, gain, fi=1.0, fo=1.0, pan=0.0, rv=None):
    n = sec(t1 - t0)
    if len(x) < n: x = np.tile(x, int(np.ceil(n / len(x))))
    x = x[:n].copy(); x *= np.minimum(1, np.arange(n) / (fi * SR + 1)) * np.minimum(1, np.arange(n)[::-1] / (fo * SR + 1))
    if rv: x = reverb(x, *rv)
    put(SFX, x, t0, gain, pan)

def at(x, t, gain, pan=0.0, rv=None):
    if rv: x = reverb(np.concatenate([x, np.zeros(sec(rv[0] * 1.2))]), *rv)
    put(SFX, x, t, gain, pan)

def build_sfx():
    # ---- shot 1 hook: rain on tin roof, thunder, the empty peg  (0-6.0)
    bed(rain_bed(st(2) + 2.5, 'tin', 1.0), 0, st(2) + 2.0, 0.12, fi=0.3, fo=2.0); cue(0, 'rain_tin', 0.12, 'night rain on the tin roof, hook')
    at(thunder(5.5), 0.1, 0.12); cue(0.1, 'thunder_low', 0.12, 'father leaves on a rainy night')
    at(door_creak(), 1.05, 0.10, pan=-0.3, rv=(0.5, 0.2, 5000)); cue(1.05, 'door_creak', 0.10, 'the door he left through')
    at(foot_gravel(), 1.7, 0.10, pan=-0.5); at(foot_gravel(), 2.05, 0.08, pan=-0.6); at(foot_gravel(), 2.4, 0.06, pan=-0.7)
    at(umbrella_absent(), st(1) + 1.2, 0.06, pan=0.3); cue(st(1) + 1.2, 'peg_tick', 0.06, 'empty peg: no umbrella left')
    # ---- shot 2 village morning (6.0-19.3)
    t2, t3 = st(2), st(5)
    bed(wind(t3 - t2 + 1, 150, 1200), t2 - 0.5, t3 + 0.5, 0.07, fi=1.5, fo=1.5); cue(t2, 'village_air', 0.07, 'soft breeze through trees')
    for tt, pn in [(7.2, -0.6), (9.0, 0.5), (10.6, -0.3), (12.4, 0.7), (14.1, -0.7), (15.9, 0.3), (17.3, 0.6)]:
        at(bird(), tt, rng.uniform(.05, .09), pan=pn, rv=(0.8, 0.3, 6000))
    cue(7.2, 'birds', 0.07, 'morning birds, sparse')
    at(crow(), 11.5, 0.05, pan=0.6, rv=(1.0, 0.4, 3000)); at(crow(), 16.4, 0.04, pan=-0.5, rv=(1.0, 0.4, 3000))
    # ---- shot 3 dheki before dawn (st5 .. ~23.2)
    t4 = st(6) + 0.31 * (en(6) - st(6)); t5 = st(6) + 0.77 * (en(6) - st(6))
    bed(crickets(t4 - t3 + 1), t3 - 0.3, t4 + 0.5, 0.03, fi=0.5, fo=1.0, rv=(0.6, 0.2, 7000)); cue(t3, 'night_crickets', 0.03, 'pre-dawn')
    k = 0
    for tt in np.arange(t3 + 0.9, t4 + 1.5, 1.45):
        at(dheki(), tt, 0.20 if k % 2 == 0 else 0.15, pan=-0.2, rv=(0.5, 0.15, 5000)); k += 1
    cue(t3 + 0.9, 'dheki_thump', 0.2, 'rhythmic rice husking, every ~1.45 s')
    # ---- shot 4 well (23.2-25.2)
    at(pulley(1.6), t4 + 0.15, 0.14, pan=0.4); at(water_splash(), t4 + 1.5, 0.15, pan=0.3, rv=(0.4, 0.2, 5000)); cue(t4 + 1.5, 'well_water', 0.15, 'bucket into the well')
    at(bird(), t5 - 0.4, 0.06, pan=-0.5)
    # ---- shot 5 tin-roof rain + drip + needle (25.2-36.2)
    t6 = st(9)
    bed(rain_bed(t6 - t5 + 2, 'tin', 0.8), t5 - 0.3, t6 + 1.0, 0.10, fi=1.5, fo=1.5); cue(t5, 'rain_tin_soft', 0.10, 'rain returns, inside the hut')
    at(thunder(4.0), t5 + 0.4, 0.12)
    drips = [28.4, 30.1, 32.0, 33.2, 34.0, 35.1]
    for j, d in enumerate(drips): at(drip(780 + 60 * (j % 3)), d, 0.26 if j < 3 else 0.2, pan=0.25, rv=(0.35, 0.15, 6000))
    cue(28.4, 'drip_in_pot', 0.26, 'matches camera kicks at 28.4/30.1/32.0')
    for tt in (26.5, 27.9, 29.2): at(cloth(0.5, 1800, 5500), tt, 0.04, pan=-0.3)
    bed(lamp_flicker(11), t5, t6, 0.025, fi=1, fo=1)
    # ---- shot 6 hunger (36.2-58.3)
    t7 = st(17)
    bed(crickets(t7 - t6 + 2), t6 - 0.5, t7 + 0.5, 0.05, fi=1.5, fo=1.5, rv=(0.6, 0.2, 7000)); cue(t6, 'night_crickets', 0.05, 'night in the hut')
    bed(lamp_flicker(t7 - t6), t6, t7, 0.025, fi=1, fo=1)
    at(tin_hollow(), t6 + 0.5, 0.22, pan=0.4, rv=(0.35, 0.2, 6000)); at(lid_scrape(), t6 + 0.15, 0.10, pan=0.4); cue(t6 + 0.5, 'rice_tin_empty', 0.22, 'চাল ফুরিয়ে গেলো')
    for j, d in enumerate([st(11) + 1.0, st(11) + 1.5, st(11) + 2.0]): at(plate_clink(), d, 0.13, pan=-0.3 + 0.3 * j, rv=(0.3, 0.12, 7000))
    cue(st(11) + 1.0, 'plates_clink', 0.13, 'ভাত বেড়ে দিয়ে')
    at(pour(1.0), st(11) + 2.5, 0.10, pan=0.2); at(glass_clink(), st(11) + 3.5, 0.10, pan=0.2); cue(st(11) + 2.5, 'water_glass', 0.10, 'she drinks only water')
    at(blanket(1.2), en(11) + 0.3, 0.07, pan=-0.2)
    at(heartbeat(8, 56), st(13) - 0.2, 0.14); cue(st(13) - 0.2, 'heartbeat', 0.14, 'সে সবই বুঝলো, Nusrat understands')
    at(sniff(), st(14) - 0.5, 0.05, pan=0.3)
    # ---- shot 7 study by the lamp (58.3-70.4)
    t8 = st(20)
    bed(crickets(t8 - t7 + 2), t7 - 0.5, t8 + 0.5, 0.04, fi=1.0, fo=1.0, rv=(0.6, 0.2, 7000))
    bed(lamp_flicker(t8 - t7), t7, t8, 0.025)
    for tt in (59.5, 63.9, 67.6): at(page_turn(), tt, 0.10, pan=-0.2, rv=(0.3, 0.1, 7000))
    for tt, d in ((60.3, 1.4), (64.8, 1.3), (68.2, 1.0)): at(scratch(d), tt, 0.07, pan=0.3)
    at(needle_sew(8)[:sec(8)], 60.5, 0.05, pan=0.5); cue(t7, 'study_foley', 0.1, 'pages, pencil, needle beside the kupi lamp')
    # ---- shot 8 bangles + form (70.4-74.6)
    t9 = st(21)
    at(bangles(), 71.9, 0.17, pan=0.1, rv=(0.35, 0.12, 8000)); cue(71.9, 'bangles', 0.17, 'চুড়ি বেচে')
    at(notes_count(5), 72.45, 0.12, pan=0.25); at(coin_press(), 73.25, 0.07, pan=0.2); cue(72.45, 'notes_counted', 0.12, 'seller counts the money for the bangles')
    at(page_turn(), 73.7, 0.12, pan=-0.2); cue(73.7, 'form_paper', 0.12, 'কলেজের ফর্ম, handed to Nusrat')
    # ---- shot 9 bus stop (74.6-82.3)
    t10 = st(23)
    bed(wind(t10 - t9 + 1, 200, 1500), t9 - 0.3, t10 + 1.0, 0.06, fi=1, fo=1)
    for tt in (75.6, 77.4): at(bird(), tt, 0.05, pan=0.6)
    at(cloth(0.9, 300, 2800), 78.7, 0.09, pan=-0.1); at(thread_tug(), 79.3, 0.05, pan=-0.1); at(notes_count(3), 79.75, 0.10, pan=0.1); at(coin_press(), 80.5, 0.10, pan=0.1)
    cue(78.7, 'anchal_knot_money', 0.09, 'knot untied, notes pressed into Nusrat palm (78.2-80.9 s)')
    at(bus_engine(9.0, 6.8), t9 + 1.4, 0.15, pan=-0.2); at(horn(), 80.2, 0.10, pan=-0.3, rv=(0.6, 0.2, 4000)); at(horn(), 80.85, 0.11, pan=-0.3, rv=(0.6, 0.2, 4000))
    cue(t9 + 1.4, 'bus_engine', 0.15, 'bus arrives, horn x2, leaves at 82.6 (camera kick)')
    at(thump_soft(), 82.6, 0.18); cue(82.6, 'bus_door_thud', 0.18, 'matches the 82.6 s kick')
    # ---- shots 10-11 town (82.3-91)
    t12 = st(26)
    bed(city_rumble(t12 - t10 + 6), t10 - 0.3, t12 + 5.0, 0.06, fi=1.5, fo=2.0); cue(t10, 'city_ambience', 0.06, 'traffic hum')
    bed(babble(12), t10 + 0.5, t12 + 3, 0.02, fi=2, fo=2, rv=(0.5, 0.3, 4500))
    at(rickshaw_bell(3), t10 + 0.8, 0.09, pan=0.5, rv=(0.6, 0.2, 7000)); at(horn(), t10 + 1.8, 0.05, pan=-0.6, rv=(1.0, 0.4, 3000)); at(horn(), t10 + 4.5, 0.05, pan=0.7, rv=(1.0, 0.4, 3000))
    at(rickshaw_bell(2), st(24) + 3.4, 0.07, pan=-0.4); at(babble(2.5), st(24) + 0.6, 0.06, pan=0.0)
    for tt in (st(25) + 0.2, st(25) + 1.0): at(scratch(0.7), tt, 0.05, pan=0.3)
    # ---- shot 12 city rain (st26 + ...)
    t13 = st(27)
    bed(rain_bed(t13 - t12 + 2, 'ground', 1.0), t12 + 2.0, t13 + 1.0, 0.13, fi=1.2, fo=1.5); cue(t12 + 2.0, 'rain_city', 0.13, 'Rahat comes to the city in the rain')
    at(rickshaw_bell(2), t13 - 1.2, 0.06, pan=0.4)
    at(key_clicks(2.0, 3), st(26) + 3.0, 0.05, pan=-0.2)
    # ---- shot 13 village golden evening (95.6-108.6)
    t14 = st(31)
    bed(wind(t14 - t13 + 1, 150, 1300), t13 - 0.5, t14 + 0.5, 0.07, fi=1.5, fo=1.5)
    bed(crickets(t14 - t13 + 1), t13 + 3, t14 + 0.5, 0.035, fi=3, fo=1.0, rv=(0.6, 0.2, 7000))
    for tt, pn in [(t13 + 1.0, -0.6), (t13 + 3.2, 0.7), (t13 + 6.0, -0.2), (t13 + 8.4, 0.5)]: at(bird(), tt, 0.06, pan=pn, rv=(0.8, 0.3, 6000))
    at(page_turn(), st(28) + 0.3, 0.09, pan=-0.2); at(paper_flap(), st(28) + 1.3, 0.07, pan=0.2) if False else None
    cue(t13, 'village_evening', 0.07, 'golden-hour air, birds, first crickets')
    a29 = st(29)
    at(scratch(1.1), a29 + 0.15, 0.08, pan=-0.4); at(key_clicks(1.2, 7), a29 + 1.25, 0.08, pan=0.0); at(page_turn(), a29 + 2.55, 0.09, pan=0.4); at(scratch(0.9), a29 + 2.7, 0.06, pan=0.4)
    cue(a29, 'three_at_work', 0.08, 'Nusrat pen, Rahat keys, Mim page: one after another (103.7-107.2 s)')
    # ---- shots 14-17 success montage (108.6-119)
    t15, t16, t17, t18 = st(32), st(33), st(34), st(35)
    bed(babble(t15 - t14 + 1), t14 - 0.3, t15 + 0.3, 0.05, fi=0.5, fo=0.5, rv=(0.5, 0.3, 4500))
    bed(key_clicks(t16 - t15 + 1, 7), t15, t16, 0.07, fi=0.3, fo=0.3, pan=0.2); cue(t14, 'office_foley', 0.06, 'bank murmur + engineer typing')
    bed(machine_hum(t16 - t15 + 1), t15 - 0.2, t16 + 0.2, 0.05, fi=0.4, fo=0.5)
    at(metal_clink(), t15 + 1.9, 0.10, pan=0.3); at(metal_clink(), t15 + 2.5, 0.08, pan=-0.2); cue(t15 + 1.9, 'machine_part_clink', 0.10, 'Rahat handles the machine part (114.8-116.5 s)')
    bed(city_rumble(t17 - t16 + 1), t16 - 0.2, t17 + 0.5, 0.07, fi=0.5, fo=0.8)
    bed(babble(t17 - t16 + 1), t16 - 0.3, t17 + 0.2, 0.06, fi=0.5, fo=0.5, rv=(0.5, 0.3, 4500)); at(bell_school(), t16 + 0.5, 0.06, pan=0.6)
    cue(t16, 'medical_gate_crowd', 0.06, 'Mim at the medical college')
    # ---- shot 17 rooftop phone call (st34)
    at(phone_ring(2), t17 - 0.95, 0.10, pan=0.1, rv=(0.4, 0.15, 6000)); cue(t17 - 0.95, 'phone_ring', 0.10, 'first salary call to mother')
    bed(wind(t18 - t17 + 1, 200, 1700), t17, t18 + 0.5, 0.06, fi=1, fo=1)
    for tt in (t17 + 1.2, t17 + 3.0): at(bird(), tt, 0.04, pan=0.7)
    # ---- shot 18 mother at home (st35 .. st37)
    t19 = st(37)
    bed(wind(t19 - t18 + 1, 150, 1200), t18 - 0.5, t19 + 0.5, 0.07, fi=1, fo=1)
    at(laugh_breath(), st(35) + 0.9, 0.08, pan=0.1); cue(st(35) + 0.9, 'soft_laugh', 0.08, 'মা হেসে বললো')
    bed(needle_sew(6), t18 + 0.5, t19 - 0.5, 0.05, pan=0.4, fi=0.3, fo=1)
    bed(phone_line(), st(36) - 0.2, en(36) + 0.2, 0.04) if False else None
    at(sniff(), st(36) + 0.6, 0.07, pan=0.2); cue(st(36) + 0.6, 'sniff', 0.07, 'মায়ের গলা কাঁপছিলো')
    # ---- shot 19 return walk (st37 - 138.1)
    t20 = st(39)
    bed(wind(t20 - t19 + 1, 150, 1500), t19 - 0.5, t20 + 0.5, 0.09, fi=1, fo=1.5); cue(t19, 'paddy_wind', 0.09, 'the three walk home through the paddy')
    for tt in np.arange(t19 + 0.5, t19 + 6.0, 0.62):
        for dx, pn in ((0, -0.3), (0.18, 0.0), (0.33, 0.3)): at(foot_gravel(), tt + dx * 0.5, 0.045, pan=pn)
    for tt, pn in [(t19 + 1.0, 0.6), (t19 + 3.5, -0.6), (t19 + 5.5, 0.4)]: at(bird(), tt, 0.06, pan=pn, rv=(0.8, 0.3, 6000))
    # ---- shot 20 key handover (138.1-154.2)
    t21 = st(44)
    bed(wind(t21 - t20 + 1, 150, 1000), t20 - 0.5, t21 + 0.5, 0.06, fi=1.5, fo=1.5)
    at(needle_sew(3)[:sec(3)], st(38) + 0.5, 0.04, pan=0.5); at(thread_tug(), 138.45, 0.07, pan=0.2); at(metal_clink(), 139.45, 0.05, pan=0.2); cue(138.45, 'needle_taken', 0.07, 'Rahat takes the needle away (138.1-139.9 s)')
    at(key_jingle(), 141.1, 0.24, pan=0.0, rv=(0.5, 0.15, 7000)); cue(141.1, 'key_in_palm', 0.24, 'matches the 141.1 s camera kick')
    at(sniff(), st(42) + 0.7, 0.05, pan=-0.3); at(cloth(0.8, 300, 2500), st(43) - 0.2, 0.04, pan=0.0)
    # ---- shot 21 hug (154.2-165.1)
    t22 = st(47)
    bed(wind(t22 - t21 + 1, 150, 1000), t21 - 0.5, t22 + 0.5, 0.05, fi=1.5, fo=2.0)
    at(hug_cloth(), t21 + 0.1, 0.12, pan=0.0); cue(t21 + 0.1, 'hug', 0.12, 'নুসরাত মায়ের হাত ধোরে')
    at(hug_cloth(), st(45) - 0.3, 0.07, pan=0.1)
    bed(crickets(t22 - t21 + 2), t21 + 4, t22 + 0.5, 0.035, fi=3, fo=1, rv=(0.6, 0.2, 7000))
    # ---- shot 22 pucca-roof rain, peaceful (165.1-175.1)
    bed(rain_bed(DUR - t22 + 1, 'pucca', 0.9), t22 - 0.3, DUR, 0.12, fi=2.5, fo=3.0); cue(t22, 'rain_pucca_soft', 0.12, 'rain on the new roof: no drips, no tin')
    at(thunder(5), t22 + 0.6, 0.07); at(blanket(2.0), st(48) + 0.5, 0.05, pan=-0.2)
    at(blanket(1.4), 172.5, 0.06, pan=-0.1); at(cloth(0.7, 600, 3500), 173.1, 0.06, pan=0.1); at(laugh_breath(), 173.55, 0.05, pan=0.0); at(blanket(1.5), 174.0, 0.04, pan=0.2)
    cue(173.1, 'tear_wipe_bed', 0.06, 'mother smiles and wipes a tear, then sleeps (172.4 s on)')
    bed(crickets(5), DUR - 5.5, DUR, 0.025, fi=2, fo=2.5, rv=(0.6, 0.2, 7000))

def bell_school():
    n = sec(1.8); return tone_ring([980, 1960, 2950], [1, .5, .3], [0.8, 0.4, 0.25], n) * np.minimum(1, np.arange(n) / 30)

# ---------------------------------------------------------------- MUSIC
Sa = 146.83  # D3
def hz(semi): return Sa * 2 ** (semi / 12)
# scale degrees as semitones above Sa (D): minor-bhairavi flavour vs. major lift
MIN = {'S': 0, 'r': 1, 'g': 3, 'm': 5, 'P': 7, 'd': 8, 'n': 10}
MAJ = {'S': 0, 'R': 2, 'G': 4, 'm': 5, 'P': 7, 'D': 9, 'N': 11}

def ks_pluck(f, dur, bright=0.5, gain=1.0):
    n = sec(dur); Np = int(SR / f); ex = noise(Np); ex = lp(ex, 4000 * bright + 800, 1)
    x = np.zeros(n); x[:Np] = ex
    g = 0.996
    a = np.zeros(Np + 2); a[0] = 1; a[Np] = -g * 0.5; a[Np + 1] = -g * 0.5
    y = signal.lfilter([1], a, x); y /= (np.max(np.abs(y)) + 1e-9)
    return y * gain * np.minimum(1, np.arange(n) / 40) * env_ar(n, 0.001, min(0.4, dur * 0.5), 1.5)

def tanpura(t0, t1, gain=0.25):
    """Pa Sa Sa low-Sa pluck cycle with jivari buzz"""
    t = t0; seq = [hz(7 - 12), hz(12 - 12 + 12), hz(12), hz(0 - 0)]
    seq = [hz(-5), hz(0), hz(0), hz(-12)]
    k = 0
    while t < t1:
        f = seq[k % 4]; n = sec(4.0); tt = np.arange(n) / SR; y = np.zeros(n)
        for h in range(1, 14):
            y += (1.0 / h ** 0.8) * np.sin(2 * np.pi * f * h * tt + rng.uniform(0, 6.28)) * np.exp(-tt / (1.6 + 1.2 / h))
        buzz = np.exp(-((tt - 0.6) / 0.5) ** 2)  # jivari: harmonics bloom after the attack
        y += buzz * sum((0.25 / h) * np.sin(2 * np.pi * f * h * tt) for h in range(6, 14))
        y = y / np.max(np.abs(y)) * np.minimum(1, tt * 200)
        ph = (t1 - t); y *= np.minimum(1, ph / 2.0) if ph < 2.0 else 1
        put(MUS, reverb(y, 1.2, 0.3), t, gain, pan=-0.15 if k % 2 else 0.15); t += 0.95 + (0.12 if k % 4 == 3 else 0); k += 1

def pad(f_list, t0, dur, gain=0.2, bright=900, attack=2.0, release=2.5):
    n = sec(dur); tt = np.arange(n) / SR; y = np.zeros(n)
    for f in f_list:
        for d in (-6, -2, 3, 7):  # cents detune
            ff = f * 2 ** (d / 1200); y += signal.sawtooth(2 * np.pi * ff * tt + rng.uniform(0, 6.28)) * 0.5 + np.sin(2 * np.pi * ff * tt) * 0.5
    y /= len(f_list) * 4
    y = lp(y, bright, 2)
    y *= np.minimum(1, tt / attack) * np.minimum(1, (dur - tt) / release)
    put(MUS, reverb(y, 1.6, 0.35), t0, gain)

def flute(notes, t0, gain=0.3, vib=5.2, breath=0.04):
    """notes: list of (freq or None, start_beat_seconds_rel, dur, slide_from_freq)"""
    for f, ts, d, f_from in notes:
        if f is None: continue
        n = sec(d + 0.25); tt = np.arange(n) / SR
        ff = np.full(n, f)
        if f_from: gl = int(0.12 * SR); ff[:gl] = np.linspace(f_from, f, gl)
        vibd = 1 + 0.006 * np.sin(2 * np.pi * vib * tt) * np.minimum(1, tt / 0.5)
        ph = 2 * np.pi * np.cumsum(ff * vibd) / SR
        y = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
        y += breath * bp(noise(n), 1800, 6000, 1) * 6
        e = np.minimum(1, tt / 0.08) * np.minimum(1, np.clip((d + 0.25 - tt) / 0.22, 0, 1))
        put(MUS, reverb(y * e, 1.4, 0.35), t0 + ts, gain, pan=0.2)

def pluck_arp(freqs, t0, step, gain=0.18, dur=1.6, reps=1, pan=-0.2, bright=0.45):
    t = t0
    for _ in range(reps):
        for f in freqs:
            put(MUS, reverb(ks_pluck(f, dur, bright), 1.0, 0.25), t, gain, pan); t += step

def piano_note(f, t, d=2.5, gain=0.2):
    n = sec(d); tt = np.arange(n) / SR; y = np.zeros(n)
    for h, a, tau in ((1, 1, 1.3), (2, .5, .9), (3, .22, .6), (4, .12, .4), (5, .07, .3)): y += a * np.sin(2 * np.pi * f * h * tt) * np.exp(-tt / tau)
    y *= np.minimum(1, tt * 400); put(MUS, reverb(y, 1.3, 0.3), t, gain, pan=0.0)

def build_music():
    t_end = DUR
    # drone under everything (thin out in the final seconds), gentler in towns
    tanpura(0.3, 28, 0.22); tanpura(28, st(17), 0.14); tanpura(st(17), st(23), 0.18); tanpura(st(23), st(31), 0.10)
    tanpura(st(31), st(44), 0.14); tanpura(st(44), t_end - 1.0, 0.18)
    f = hz
    # ---- A: hook 0-6 : low D pad, one lonely flute note
    pad([f(-12), f(-5), f(3 - 12)], 0.2, 7.0, 0.16, 500, 2.5, 2.5)
    flute([(f(12 + 7), 3.4, 2.4, f(12 + 10))], 0, 0.22)                              # A5 falling
    # ---- B: village morning 6-19.3
    pad([f(-12), f(-5), f(0)], 6.0, 14.0, 0.15, 620, 3, 3)
    flute([(f(12 + 3), 7.5, 1.0, None), (f(12 + 1), 8.7, 0.6, None), (f(12 + 0), 9.4, 1.8, None),
           (f(12 + 3), 12.6, 0.9, None), (f(12 + 5), 13.6, 1.2, None), (f(12 + 3), 15.0, 1.0, None), (f(12 + 1), 16.2, 2.4, None)], 0, 0.20)
    # ---- C: 19.3-36.2  dawn work, drips
    pad([f(-7), f(0), f(3)], 19.3, 17.0, 0.14, 560, 3, 3)
    pluck_arp([f(0), f(7), f(12), f(7)], 21.0, 1.9, 0.10, 2.4, 4)
    pluck_arp([f(-4), f(3), f(8), f(3)], 29.0, 2.0, 0.10, 2.4, 3)
    flute([(f(12 + 7), 26.5, 1.8, None), (f(12 + 5), 28.4, 1.4, None), (f(12 + 3), 30.0, 3.4, None)], 0, 0.16)
    # ---- D: hunger and the vow 36.2-58.3  (minor, low strings feeling)
    pad([f(-14), f(-7), f(-2)], 36.2, 11.0, 0.18, 520, 3.5, 3)     # Bb
    pad([f(-12), f(-5), f(3 - 12)], 47.0, 11.8, 0.20, 560, 3.5, 3)  # Dm
    flute([(f(12 + 7), 39.0, 3.0, f(12 + 8)), (f(12 + 3), 44.5, 2.8, None), (f(12 + 5), 50.8, 2.0, None), (f(12 + 3), 53.0, 2.6, None)], 0, 0.20)
    flute([(f(12 + 12), 57.0, 2.4, f(12 + 7))], 0, 0.18)             # the vow: she looks up, rising
    # ---- E: lamp light & farewell 58.3-82.3  (warmer, hope)
    for i, (ch, tt0) in enumerate([([f(-12), f(-5), f(3)], 58.0), ([f(-7), f(0), f(5)], 63.7), ([f(-14), f(-7), f(2)], 69.4), ([f(-12), f(-5), f(2)], 74.0)]):
        pad(ch, tt0, 6.5, 0.17, 700, 2.5, 2.5)
    pluck_arp([f(0), f(7), f(10), f(15)], 59.0, 0.9, 0.12, 2.0, 6)
    pluck_arp([f(-2), f(5), f(8), f(12)], 64.4, 0.9, 0.12, 2.0, 6)
    flute([(f(12 + 3), 60.0, 1.5, None), (f(12 + 5), 61.6, 1.2, None), (f(12 + 7), 63.0, 2.6, None), (f(12 + 5), 66.5, 1.4, None),
           (f(12 + 8), 68.1, 1.8, None), (f(12 + 7), 70.2, 2.6, None), (f(12 + 5), 73.4, 1.5, None), (f(12 + 3), 75.2, 3.2, None)], 0, 0.22)
    pad([f(-12), f(-5), f(2), f(7)], 78.0, 6.5, 0.20, 900, 2.0, 2.0)  # the bus pulls away: swell then fall
    flute([(f(12 + 7), 79.0, 2.6, f(12 + 5)), (f(12 + 3), 81.8, 2.6, f(12 + 5))], 0, 0.20)
    # ---- F: town 82.3-95.6  (pulse, uncertainty)
    for k in range(int((st(27) - st(23)) / 1.2)):
        notes = [f(0), f(7), f(5), f(3)]
        put(MUS, reverb(ks_pluck(notes[k % 4] * 2, 0.5, .3), 0.5, 0.15), 83.5 + k * 1.2, 0.10, pan=0.25)
    pad([f(-12), f(-9), f(-2)], 83.0, 12.5, 0.15, 620, 2.5, 2.5)
    flute([(f(12 + 3), 87.0, 1.4, None), (f(12 + 5), 88.5, 1.2, None), (f(12 + 3), 90.0, 1.6, None), (f(12 + 1), 92.2, 2.8, None)], 0, 0.15)
    # ---- G: village evening, studying, then success 95.6-119   (shift to the major lift at 108.6)
    pad([f(-12), f(-5), f(3)], 95.6, 13.0, 0.16, 700, 3, 2)
    pluck_arp([f(0), f(7), f(12), f(15)], 96.5, 1.1, 0.11, 2.2, 10)
    flute([(f(12 + 5), 97.2, 1.8, None), (f(12 + 7), 99.2, 1.6, None), (f(12 + 5), 101.0, 1.4, None), (f(12 + 3), 102.6, 3.0, None), (f(12 + 5), 105.6, 2.0, None)], 0, 0.20)
    t = st(31)  # success: D major
    pad([f(-12), f(-8), f(-5)], t - 0.3, 5.5, 0.20, 1100, 1.2, 1.5)
    pad([f(-10), f(-6), f(-3)], t + 5.0, 6.0, 0.20, 1100, 1.2, 1.5)
    for k, nt in enumerate([0, 4, 7, 12, 14, 12, 7, 4]):
        put(MUS, reverb(ks_pluck(f(nt + 12), 1.2, .5), 0.8, 0.2), t + k * 0.5, 0.13, pan=-0.2 + 0.05 * k)
    flute([(f(12 + 9), t, 1.2, None), (f(12 + 11), t + 1.3, 1.0, None), (f(12 + 14), t + 2.4, 1.8, None), (f(12 + 12), t + 4.5, 1.2, None),
           (f(12 + 9), t + 6.0, 1.4, None), (f(12 + 7), t + 7.6, 2.4, None)], 0, 0.20)
    # ---- H: the call 119-130 (back to tender minor/major mix, hushed)
    t = st(34)
    pad([f(-12), f(-5), f(2)], t - 0.2, 12.0, 0.17, 800, 2.5, 3)
    for k, nt in enumerate([14, 12, 9, 12, 14, 9]): piano_note(f(nt), t + 0.6 + k * 1.75, 2.8, 0.14)
    flute([(f(12 + 10), st(36) + 0.5, 3.0, f(12 + 9))], 0, 0.15)    # her voice trembles (Bb over D)
    # ---- I: home, the key, the hug 130.5-165  (the emotional peak)
    t = st(37)
    pad([f(-12), f(-5), f(4)], t - 0.2, 8.0, 0.18, 900, 2.0, 2.0)
    pluck_arp([f(0), f(7), f(12), f(16)], t + 0.3, 1.0, 0.12, 2.2, 7)
    flute([(f(12 + 7), t + 0.5, 2.0, None), (f(12 + 9), t + 2.6, 1.6, None), (f(12 + 11), t + 4.3, 2.8, None)], 0, 0.20)
    t = st(39)   # key handover: pad softens, key kick at 141.1, quiet moment while mother is silent
    pad([f(-12), f(-5), f(2), f(9)], t - 0.2, 8.5, 0.17, 800, 1.5, 2.5)
    piano_note(f(14), 141.1, 3.0, 0.18); piano_note(f(7), 141.1, 3.0, 0.10)
    pad([f(-14), f(-7), f(-2), f(2)], st(42) - 0.3, 6.2, 0.15, 500, 2.5, 2.5)  # Gm: she is silent
    t = st(44)   # the hug: strings climb to the climax at "তুমি আমাদের সবকিছু ছিলে", then rest on "এবার তোমার ছুটি"
    pad([f(-12), f(-5), f(4), f(7)], t - 0.3, 5.4, 0.20, 1200, 1.5, 1.5)
    pad([f(-10), f(-3), f(2), f(6)], t + 4.7, 4.6, 0.22, 1400, 1.0, 1.5)
    pad([f(-12), f(-5), f(4), f(12)], st(46) - 0.2, 6.0, 0.20, 1300, 1.2, 3.5)
    flute([(f(12 + 9), t + 0.4, 2.2, None), (f(12 + 11), t + 2.7, 1.6, None), (f(12 + 14), t + 4.5, 3.2, f(12 + 11)),
           (f(12 + 12), t + 8.0, 2.0, None), (f(12 + 9), t + 10.2, 2.5, None)], 0, 0.24)
    for k, nt in enumerate([0, 4, 7, 12, 16, 12, 7, 4, 0, 4, 7, 12]): put(MUS, reverb(ks_pluck(f(nt + 12), 1.4, .5), 0.8, 0.2), t + 0.3 + k * 0.9, 0.11, pan=0.25 - 0.04 * k)
    # ---- J: rain finale 165-175 : D major, a final falling phrase, then silence under rain
    t = st(47)
    pad([f(-12), f(-8), f(-5), f(2)], t - 0.2, 12.4, 0.16, 700, 2.0, 5.5)
    piano_note(f(-12), 174.6, 4.0, 0.14)
    for k, nt in enumerate([14, 11, 9, 7, 4]): piano_note(f(nt + 12 - 12), t + 0.9 + k * 1.75, 3.0, 0.15)
    flute([(f(12 + 9), t + 3.3, 2.2, None), (f(12 + 7), t + 5.6, 1.6, None), (f(12 + 4), t + 7.1, 3.0, f(12 + 7))], 0, 0.16)

def sidechain_free(): pass

if __name__ == '__main__':
    build_sfx(); build_music()
    def fin(a, b, name):
        y = np.stack([a, b], 1)
        pk = np.max(np.abs(y)); print(name, 'peak', round(pk, 3), 'rms', round(float(np.sqrt(np.mean(y ** 2))), 4))
        wavfile.write(name, SR, (y / max(pk, 1e-9) * 0.9 * 32767).astype(np.int16)); return y / max(pk, 1e-9) * 0.9
    # fade tails
    for b in (L, R, ML, MR):
        b[-sec(0.5):] *= np.linspace(1, 0, sec(0.5))
    np.save('sfx_raw.npy', np.stack([L, R])); np.save('mus_raw.npy', np.stack([ML, MR]))
    json.dump(CUES, open('cues.json', 'w'), indent=1, ensure_ascii=False)
    print('cues', len(CUES))
