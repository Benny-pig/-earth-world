"""
compose-music.py — 產生「地球世界」的原創背景音樂(無版權顧慮)。

共用一組合成原語(pad / 鐘聲 / 琶音 / sub bass / 噪音水聲 / Freeverb 殘響 /
無縫循環 / 主匯流排),下面 PRESETS 用不同組合做出不同風格:

  earth-world  流行宇宙(預設)—— 暖 pad + 鐘聲琶音 + 律動 bass + 輕 kick
  crystal      水晶空靈       —— 玻璃感 FM 鐘 + 微光 pad + 超長殘響,無鼓無 bass
  spa          SPA 療養       —— 溫暖低 pad + 五聲慢旋律 + 水聲,極慢,無鼓
  deepspace    深空冥想       —— 低頻嗡鳴 drone + 偶發 sub 湧動 + 稀疏高音,巨大殘響
  nebula       星塵電子       —— 十六分音琶音 + sidechain pad + 旋律 lead + 柔和 kick

執行:
  .../python.exe tools/compose-music.py            # 全部重算
  .../python.exe tools/compose-music.py crystal spa # 只算指定幾首
輸出:assets/music/<id>.wav
"""
import sys, os, wave
import numpy as np
from scipy.signal import lfilter, butter

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "music"))

def hz(semis_from_a4):
    return 440.0 * 2.0 ** (semis_from_a4 / 12.0)

# ---------------------------------------------------------------- 共用原語

def make_reverb(SR):
    def comb(x, delay, fb):
        a = np.zeros(delay + 1); a[0] = 1.0; a[delay] = -fb
        y = lfilter([1.0], a, x)
        lb, la = butter(1, 4200 / (SR / 2), btype="low")
        return lfilter(lb, la, y) * (1 - fb)
    def allpass(x, delay, g):
        a = np.zeros(delay + 1); a[0] = 1.0; a[delay] = -g
        bff = np.zeros(delay + 1); bff[0] = -g; bff[delay] = 1.0
        return lfilter(bff, a, x)
    def reverb(mono, size=1.0, wet_combs=(1116, 1188, 1277, 1356, 1422, 1491), fb=0.84):
        acc = np.zeros_like(mono)
        for c in wet_combs:
            acc += comb(mono, max(2, int(c * size * SR / 44100)), fb)
        acc /= len(wet_combs)
        for d in (556, 441, 341, 225):
            acc = allpass(acc, max(2, int(d * size * SR / 44100)), 0.5)
        return acc
    return reverb

def seg_chord_times(total, seg):
    t = 0.0
    while t < total:
        yield t
        t += seg

def synth_pad(SR, n_ext, t, chords, seg, rng, level=0.13, detune=0.0016,
              attack=0.7, rel=1.0, trem_hz=0.08, harm=(1.0, 0.35, 0.12)):
    """暖和弦 pad。chords: list of freq-lists,每段 seg 秒輪一個。"""
    out = np.zeros((n_ext, 2))
    for k, tstart in enumerate(seg_chord_times((n_ext / SR), seg)):
        ch = chords[k % len(chords)]
        i0 = int(tstart * SR); i1 = int(min((tstart + seg + rel) * SR, n_ext))
        if i1 <= i0:
            break
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.clip(lt / attack, 0, 1) * np.clip((seg + rel - lt) / (rel + 0.1), 0, 1)
        env = env ** 1.3
        trem = (1 - 0.12) + 0.12 * np.sin(2 * np.pi * trem_hz * t[i0:i1])
        for j, f in enumerate(ch):
            for det, pan in ((-detune, 0.30), (detune, 0.70), (0.0, 0.5)):
                ph = 2 * np.pi * f * (1 + det) * lt + rng.uniform(0, 6.283)
                v = sum(a * np.sin((m + 1) * ph) for m, a in enumerate(harm))
                amp = env * trem * (level / (1 + 0.55 * j))
                out[i0:i1, 0] += v * amp * (1 - pan)
                out[i0:i1, 1] += v * amp * pan
    return out

def bell_arp(SR, n_ext, t, chords, seg, step, pattern, rng, level=0.16,
             decay=4.5, fm=0.6, octave_of=lambda cyc: 1.0, prog_len=None):
    out = np.zeros((n_ext, 2))
    nsteps = int(np.ceil(n_ext / (step * SR)))
    pl = prog_len or (seg * len(chords))
    for s in range(nsteps):
        tstart = s * step
        ci = int((tstart % pl) // seg) % len(chords)
        ch = chords[ci]
        octv = octave_of(int(tstart // pl))
        f = ch[pattern[s % len(pattern)] % len(ch)] * octv
        dur = min(1.3, step * 6)
        i0 = int(tstart * SR); i1 = int(min((tstart + dur) * SR, n_ext))
        if i1 <= i0:
            continue
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.exp(-lt * decay) * (1 - np.exp(-lt * 120))
        ph = 2 * np.pi * f * lt + fm * np.sin(2 * np.pi * f * 2.01 * lt) * np.exp(-lt * 6)
        v = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)) * env * level
        pan = 0.5 + 0.22 * ((s % 2) * 2 - 1)
        out[i0:i1, 0] += v * (1 - pan)
        out[i0:i1, 1] += v * pan
    return out

def ping_pong(x, SR, delay_s, fb=0.38, taps=6):
    dl = int(delay_s * SR)
    buf = x.copy(); tap = x.copy()
    for _ in range(taps):
        sh = np.zeros_like(tap)
        sh[dl:, 0] = tap[:-dl, 1] * fb
        sh[dl:, 1] = tap[:-dl, 0] * fb
        buf += sh; tap = sh
    return buf

def sub_bass(SR, n_ext, t, chords_bass, seg, beat, level=0.5, sidechain=0.55):
    out = np.zeros(n_ext)
    duck = 1 - sidechain * np.exp(-((t % beat) / 0.10) ** 2)
    for k, tstart in enumerate(seg_chord_times((n_ext / SR), seg)):
        f = chords_bass[k % len(chords_bass)]
        i0 = int(tstart * SR); i1 = int(min((tstart + seg + 0.2) * SR, n_ext))
        if i1 <= i0:
            break
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.clip(lt / 0.05, 0, 1) * np.clip((seg + 0.2 - lt) / 0.25, 0, 1)
        v = (np.sin(2 * np.pi * f * lt) + 0.22 * np.sin(2 * np.pi * 2 * f * lt)) * env
        out[i0:i1] += v * level
    return out * duck

def soft_kick(SR, n_ext, beat, level=0.16, start_s=0.0, every=2):
    out = np.zeros(n_ext)
    for s in range(int(n_ext / (SR * beat))):
        tb = s * beat
        if tb < start_s or s % every != 0:
            continue
        i0 = int(tb * SR); i1 = int(min((tb + 0.35) * SR, n_ext))
        lt = (np.arange(i0, i1) - i0) / SR
        pitch = 48 * np.exp(-lt * 28) + 40
        out[i0:i1] += np.sin(2 * np.pi * pitch * lt) * np.exp(-lt * 9) * level
    return out

def noise_wash(SR, n_ext, t, rng, band=(400, 3500), level=0.03, lfo=0.05):
    bb, aa = butter(2, [band[0] / (SR / 2), band[1] / (SR / 2)], btype="band")
    w = lfilter(bb, aa, rng.standard_normal(n_ext)) * level
    L = w * (0.7 + 0.3 * np.sin(2 * np.pi * lfo * t))
    R = w * (0.7 + 0.3 * np.cos(2 * np.pi * lfo * t))
    return np.stack([L, R], axis=1)

def drone(SR, n_ext, t, roots, level=0.12):
    """低頻嗡鳴:每個 root 疊兩個微失諧 sine 產生慢速拍音。"""
    out = np.zeros(n_ext)
    for f in roots:
        out += np.sin(2 * np.pi * f * t) * level
        out += np.sin(2 * np.pi * (f * 1.004) * t) * level * 0.9
    swell = 0.6 + 0.4 * np.sin(2 * np.pi * 0.03 * t)
    return out * swell

def master(SR, mix, target_rms_db=-13.0, hp=32, air_hz=6500, air_amt=0.5):
    hb, ha = butter(2, hp / (SR / 2), btype="high")
    sb, sa = butter(2, air_hz / (SR / 2), btype="high")
    for c in range(2):
        mix[:, c] = lfilter(hb, ha, mix[:, c])
        if air_amt:
            mix[:, c] = mix[:, c] + air_amt * lfilter(sb, sa, mix[:, c])
    rms = np.sqrt((mix ** 2).mean()) + 1e-9
    mix *= 10 ** ((target_rms_db - 20 * np.log10(rms)) / 20)
    mix = np.tanh(mix)
    mix /= (np.max(np.abs(mix)) + 1e-9)
    return mix * 0.85

def seamless(mix, n, SR, fade_ms=12):
    head = mix[:n].copy()
    tail = mix[n:]
    tl = len(tail)
    if tl:
        head[:tl] += tail
    fl = int(fade_ms / 1000 * SR)
    head[:fl] *= np.linspace(0, 1, fl)[:, None]
    head[-fl:] *= np.linspace(1, 0, fl)[:, None]
    return head

def write_wav(path, mix, SR):
    i16 = np.clip(mix * 32767, -32768, 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(i16.tobytes())
    return os.path.getsize(path)

# ---------------------------------------------------------------- 各首 preset

def build_earth_world():
    SR, BPM = 32000, 84.0
    beat = 60 / BPM; bar = 4 * beat; seg = 2 * bar
    n = int(round(SR * seg * 4 * 3)); n_ext = n + int(SR * 3.0)
    t = np.arange(n_ext) / SR; rng = np.random.default_rng(20260909)
    C = [[hz(-19), hz(-12), hz(-7), hz(-3)], [hz(-17), hz(-12), hz(-8), hz(-5)],
         [hz(-22), hz(-15), hz(-10), hz(-7)], [hz(-14), hz(-10), hz(-7), hz(-2)]]
    B = [hz(-31), hz(-24), hz(-34), hz(-26)]
    prog = seg * 4
    pad = synth_pad(SR, n_ext, t, C, seg, rng, level=0.13)
    arp = bell_arp(SR, n_ext, t, C, seg, beat / 2, [0, 1, 2, 3, 2, 1], rng,
                   octave_of=lambda cyc: 2.0 if cyc % 2 else 1.0, prog_len=prog)
    arp = ping_pong(arp, SR, beat * 0.75)
    bass = sub_bass(SR, n_ext, t, B, seg, beat)
    air = noise_wash(SR, n_ext, t, rng, (3000, 8000), 0.02) + \
          synth_pad(SR, n_ext, t, [[f * 4 for f in c] for c in C], seg, rng, level=0.010, attack=1.0)
    kick = soft_kick(SR, n_ext, beat, 0.15, start_s=prog)
    rev = make_reverb(SR)
    wetL = pad[:, 0] + arp[:, 0] * 0.9 + air[:, 0]
    wetR = pad[:, 1] + arp[:, 1] * 0.9 + air[:, 1]
    revS = np.stack([rev(wetL), rev(wetR)], axis=1) * 0.22
    mix = pad + arp + air + revS
    mix[:, 0] += bass * 0.58 + kick * 0.55
    mix[:, 1] += bass * 0.58 + kick * 0.55
    return SR, seamless(master(SR, mix), n, SR)

def build_crystal():
    SR = 32000
    seg = 9.0
    n = int(round(SR * seg * 8)); n_ext = n + int(SR * 6.0)
    t = np.arange(n_ext) / SR; rng = np.random.default_rng(7717)
    # A 大調氛圍,寬鬆和聲(add9 / sus)
    C = [[hz(0), hz(4), hz(9), hz(14), hz(19)],       # A C# F# ... 明亮
         [hz(-3), hz(2), hz(7), hz(12), hz(16)],
         [hz(-5), hz(2), hz(7), hz(11), hz(14)],
         [hz(-1), hz(4), hz(9), hz(11), hz(16)]]
    pad = synth_pad(SR, n_ext, t, C, seg, rng, level=0.10, attack=2.2, rel=2.5,
                    trem_hz=0.05, harm=(1.0, 0.15, 0.05, 0.02))
    # 高音玻璃鐘,慢速隨機灑落
    bells = np.zeros((n_ext, 2))
    tcur = 0.5
    while tcur < n_ext / SR - 2:
        ch = C[int(tcur // seg) % len(C)]
        f = ch[rng.integers(1, len(ch))] * (2.0 if rng.random() < 0.6 else 4.0)
        i0 = int(tcur * SR); i1 = int(min((tcur + 3.5) * SR, n_ext))
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.exp(-lt * 1.6) * (1 - np.exp(-lt * 80))
        ph = 2 * np.pi * f * lt + 0.9 * np.sin(2 * np.pi * f * 3.01 * lt) * np.exp(-lt * 3)
        v = (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(5 * ph)) * env * 0.11
        pan = rng.random()
        bells[i0:i1, 0] += v * (1 - pan); bells[i0:i1, 1] += v * pan
        tcur += rng.uniform(0.35, 1.1)
    bells = ping_pong(bells, SR, 0.66, fb=0.44, taps=8)
    rev = make_reverb(SR)
    wetL = pad[:, 0] + bells[:, 0]
    wetR = pad[:, 1] + bells[:, 1]
    revS = np.stack([rev(wetL, size=1.8, fb=0.9), rev(wetR, size=1.8, fb=0.9)], axis=1) * 0.5
    mix = pad * 0.9 + bells + revS
    return SR, seamless(master(SR, mix, target_rms_db=-15, air_hz=7000, air_amt=0.7), n, SR)

def build_spa():
    SR = 24000
    seg = 8.0
    n = int(round(SR * seg * 8)); n_ext = n + int(SR * 4.0)
    t = np.arange(n_ext) / SR; rng = np.random.default_rng(4242)
    # C 大調五聲,溫暖低把位
    C = [[hz(-24), hz(-17), hz(-12), hz(-8)], [hz(-19), hz(-15), hz(-8), hz(-3)],
         [hz(-21), hz(-14), hz(-9), hz(-5)], [hz(-24), hz(-19), hz(-12), hz(-7)]]
    pad = synth_pad(SR, n_ext, t, C, seg, rng, level=0.14, attack=2.5, rel=2.0,
                    trem_hz=0.04, harm=(1.0, 0.5, 0.18, 0.06))   # Rhodes 般的暖音色
    # 五聲慢旋律(C D E G A)
    penta = [hz(-9), hz(-7), hz(-5), hz(-2), hz(0), hz(3), hz(7)]
    mel = np.zeros((n_ext, 2))
    tcur = 2.0
    while tcur < n_ext / SR - 3:
        f = penta[rng.integers(0, len(penta))]
        dur = rng.uniform(1.5, 3.0)
        i0 = int(tcur * SR); i1 = int(min((tcur + dur + 1.0) * SR, n_ext))
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.clip(lt / 0.4, 0, 1) * np.exp(-np.clip(lt - dur, 0, None) * 2.5)
        vib = 1 + 0.006 * np.sin(2 * np.pi * 5 * lt)
        v = (np.sin(2 * np.pi * f * lt * vib) + 0.3 * np.sin(4 * np.pi * f * lt)) * env * 0.12
        mel[i0:i1, 0] += v * 0.55; mel[i0:i1, 1] += v * 0.55
        tcur += dur + rng.uniform(0.3, 1.2)
    water = noise_wash(SR, n_ext, t, rng, (300, 2200), 0.05, lfo=0.07)
    rev = make_reverb(SR)
    wetL = pad[:, 0] + mel[:, 0]
    wetR = pad[:, 1] + mel[:, 1]
    revS = np.stack([rev(wetL, size=1.4), rev(wetR, size=1.4)], axis=1) * 0.34
    mix = pad + mel + water + revS
    return SR, seamless(master(SR, mix, target_rms_db=-14, air_hz=5000, air_amt=0.25), n, SR)

def build_deepspace():
    SR = 24000
    total = 80.0
    n = int(round(SR * total)); n_ext = n + int(SR * 8.0)
    t = np.arange(n_ext) / SR; rng = np.random.default_rng(9001)
    dr = drone(SR, n_ext, t, [hz(-38), hz(-31), hz(-26), hz(-19)], level=0.11)   # D 低把位堆疊
    # 稀疏高音 ping
    pings = np.zeros((n_ext, 2))
    tones = [hz(7), hz(12), hz(14), hz(19), hz(21)]
    tcur = 4.0
    while tcur < n_ext / SR - 4:
        f = tones[rng.integers(0, len(tones))]
        i0 = int(tcur * SR); i1 = int(min((tcur + 4.0) * SR, n_ext))
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.exp(-lt * 1.1) * (1 - np.exp(-lt * 40))
        v = (np.sin(2 * np.pi * f * lt) + 0.3 * np.sin(4 * np.pi * f * lt)) * env * 0.08
        pan = rng.random()
        pings[i0:i1, 0] += v * (1 - pan); pings[i0:i1, 1] += v * pan
        tcur += rng.uniform(3.0, 7.0)
    # 偶發 sub 湧動
    sub = np.zeros(n_ext)
    for c in range(3):
        tc = 10 + c * 24
        i0 = int(tc * SR); i1 = int(min((tc + 12) * SR, n_ext))
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.sin(np.pi * np.clip(lt / 12, 0, 1)) ** 2
        sub[i0:i1] += np.sin(2 * np.pi * hz(-43) * lt) * env * 0.5
    rev = make_reverb(SR)
    drS = rev(dr, size=2.2, fb=0.9)
    pL = pings[:, 0] + drS * 0.4
    pR = pings[:, 1] + drS * 0.4
    revP = np.stack([rev(pL, size=2.4, fb=0.92), rev(pR, size=2.4, fb=0.92)], axis=1) * 0.55
    mix = np.stack([dr, dr], axis=1) + pings + revP
    mix[:, 0] += sub * 0.6; mix[:, 1] += sub * 0.6
    return SR, seamless(master(SR, mix, target_rms_db=-16, hp=24, air_hz=6000, air_amt=0.2), n, SR)

def build_nebula():
    SR, BPM = 32000, 96.0
    beat = 60 / BPM; bar = 4 * beat; seg = 2 * bar
    n = int(round(SR * seg * 4 * 3)); n_ext = n + int(SR * 3.0)
    t = np.arange(n_ext) / SR; rng = np.random.default_rng(555)
    # F# 小調:i - VI - III - VII  (夏の構造線 那種 atmospheric melodic electronic)
    C = [[hz(-3), hz(0), hz(4), hz(9)], [hz(-6), hz(-1), hz(2), hz(6)],
         [hz(-8), hz(-3), hz(1), hz(4)], [hz(-1), hz(4), hz(8), hz(11)]]
    Bd = [hz(-27), hz(-30), hz(-32), hz(-25)]
    prog = seg * 4
    # sidechain pad
    pad = synth_pad(SR, n_ext, t, C, seg, rng, level=0.12, attack=0.4, rel=0.6, trem_hz=0.0)
    duck = (1 - 0.5 * np.exp(-((t % beat) / 0.09) ** 2))[:, None]
    pad *= duck
    # 十六分琶音 pluck
    arp = bell_arp(SR, n_ext, t, C, seg, beat / 4, [0, 1, 2, 3, 2, 3, 1, 2], rng,
                   level=0.10, decay=9.0, fm=0.2,
                   octave_of=lambda cyc: 2.0, prog_len=prog)
    arp = ping_pong(arp, SR, beat * 0.75, fb=0.34, taps=5)
    # 旋律 lead(方波感,柔化)
    lead = np.zeros((n_ext, 2))
    scale = [hz(-3), hz(-1), hz(0), hz(3), hz(4), hz(6), hz(9), hz(11)]
    tcur = seg  # 第一段留白
    while tcur < n_ext / SR - 2:
        f = scale[rng.integers(0, len(scale))] * 2
        dur = beat * rng.choice([1, 1, 2, 1.5])
        i0 = int(tcur * SR); i1 = int(min((tcur + dur + 0.3) * SR, n_ext))
        lt = (np.arange(i0, i1) - i0) / SR
        env = np.clip(lt / 0.02, 0, 1) * np.exp(-np.clip(lt - dur * 0.7, 0, None) * 8)
        sq = np.tanh(3 * np.sin(2 * np.pi * f * lt))
        lb, la = butter(2, 3500 / (SR / 2), btype="low")
        v = lfilter(lb, la, sq) * env * 0.09
        lead[i0:i1, 0] += v * 0.5; lead[i0:i1, 1] += v * 0.5
        tcur += dur
    bass = sub_bass(SR, n_ext, t, Bd, seg, beat, level=0.42, sidechain=0.6)
    kick = soft_kick(SR, n_ext, beat, 0.16, start_s=0.0, every=1)
    rev = make_reverb(SR)
    wetL = pad[:, 0] + arp[:, 0] + lead[:, 0]
    wetR = pad[:, 1] + arp[:, 1] + lead[:, 1]
    revS = np.stack([rev(wetL), rev(wetR)], axis=1) * 0.2
    mix = pad + arp + lead + revS
    mix[:, 0] += bass + kick
    mix[:, 1] += bass + kick
    return SR, seamless(master(SR, mix, target_rms_db=-12), n, SR)

PRESETS = {
    "earth-world": build_earth_world,
    "crystal": build_crystal,
    "spa": build_spa,
    "deepspace": build_deepspace,
    "nebula": build_nebula,
}

if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    which = sys.argv[1:] or list(PRESETS)
    for name in which:
        if name not in PRESETS:
            print("!! unknown preset:", name); continue
        SR, mix = PRESETS[name]()
        path = os.path.join(OUT_DIR, name + ".wav")
        size = write_wav(path, mix, SR)
        dur = mix.shape[0] / SR
        rms = 20 * np.log10(np.sqrt((mix ** 2).mean()) + 1e-9)
        print(f"{name:12s}  {dur:5.1f}s  {SR}Hz  {size/1048576:4.1f}MB  RMS {rms:5.1f}dB")
