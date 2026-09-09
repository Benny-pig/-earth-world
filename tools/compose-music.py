"""
compose-music.py — 產生「地球世界」的背景音樂(原創,無版權顧慮)。

風格:流行 + 宇宙氛圍。D 大調、84 BPM、I–V–vi–IV 進行(D–A–Bm–G),
暖 pad + 鐘聲琶音(帶 ping-pong delay)+ sidechain 律動的 sub bass +
高頻空氣感 + 輕柔 kick,最後過 Freeverb 式殘響。輸出無縫循環的 stereo WAV。

執行:F:/Claude/stable-diffusion-webui/venv/Scripts/python.exe tools/compose-music.py
輸出:assets/music.wav
"""
import numpy as np
from scipy.signal import lfilter
import wave, struct, os

SR = 32000
BPM = 84.0
beat = 60.0 / BPM
bar = 4 * beat
LOOP_BARS = 8          # 一次完整 D–A–Bm–G(每和弦 2 小節)
CYCLES = 3
TAIL = 3.0            # 尾巴(殘響 / release)折回開頭做無縫循環
T = bar * LOOP_BARS * CYCLES
n = int(round(SR * T))
n_ext = n + int(SR * TAIL)
t = np.arange(n_ext) / SR
rng = np.random.default_rng(20260909)

def hz(semis_from_a4):
    return 440.0 * 2.0 ** (semis_from_a4 / 12.0)

# 和弦(每和弦 2 小節);voicing 落在中音域,聲部平順
CHORDS = [
    dict(name="D",  notes=[hz(-19), hz(-12), hz(-7),  hz(-3)],  bass=hz(-31)),   # D3 A3 D4 F#4 / D2
    dict(name="A",  notes=[hz(-17), hz(-12), hz(-8),  hz(-5)],  bass=hz(-24)),   # E3 A3 C#4 E4 / A2
    dict(name="Bm", notes=[hz(-22), hz(-15), hz(-10), hz(-7)],  bass=hz(-34)),   # B2 F#3 B3 D4 / B1
    dict(name="G",  notes=[hz(-14), hz(-10), hz(-7),  hz(-2)],  bass=hz(-26)),   # G3 B3 D4 G4 / G2
]
SEG = 2 * bar                                   # 每和弦時長
prog_len = SEG * 4                              # 一次進行 = 8 小節

def seg_index(time):
    return int((time % prog_len) // SEG)

# ---------- 1. 暖 PAD ----------
pad = np.zeros((n_ext, 2))
for k in range(CYCLES * LOOP_BARS // 2):        # 幾個和弦段
    tstart = k * SEG
    ci = k % 4
    ch = CHORDS[ci]
    i0 = int(tstart * SR)
    i1 = int(min((tstart + SEG + 0.9) * SR, n_ext))   # 稍微超出以連到下一段
    idx = np.arange(i0, i1)
    lt = (idx - i0) / SR
    # 每段包絡:慢起、緩落
    env = np.clip(lt / 0.7, 0, 1) * np.clip((SEG + 0.9 - lt) / 1.1, 0, 1)
    env = env ** 1.3
    trem = 0.90 + 0.10 * np.sin(2 * np.pi * 0.08 * (t[i0:i1]))
    for j, f in enumerate(ch["notes"]):
        for det, pan in ((-0.0016, 0.32), (0.0016, 0.68), (0.0, 0.5)):
            ph = 2 * np.pi * f * (1 + det) * lt + rng.uniform(0, 6.283)
            v = (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph))
            amp = env * trem * (0.13 / (1 + 0.6 * j))
            pad[i0:i1, 0] += v * amp * (1 - pan)
            pad[i0:i1, 1] += v * amp * pan

# ---------- 2. 鐘聲琶音 ----------
arp = np.zeros((n_ext, 2))
step = beat / 2                                  # 八分音符
pattern = [0, 1, 2, 3, 2, 1]                     # 上下行
nsteps = int(np.ceil(n_ext / (step * SR)))
for s in range(nsteps):
    tstart = s * step
    ci = seg_index(tstart)
    ch = CHORDS[ci]
    cycle = int(tstart // (prog_len))
    octave = 2.0 if (cycle % 2 == 1) else 1.0    # 第二輪高八度,增添變化
    f = ch["notes"][pattern[s % len(pattern)]] * octave
    dur = 0.9
    i0 = int(tstart * SR)
    i1 = int(min((tstart + dur) * SR, n_ext))
    lt = (np.arange(i0, i1) - i0) / SR
    env = np.exp(-lt * 4.5) * (1 - np.exp(-lt * 120))
    # FM 一點點,金屬光澤
    ph = 2 * np.pi * f * lt + 0.6 * np.sin(2 * np.pi * f * 2.01 * lt) * np.exp(-lt * 6)
    v = (np.sin(ph) + 0.5 * np.sin(2 * ph) + 0.25 * np.sin(3 * ph)) * env * 0.16
    pan = 0.4 + 0.2 * ((s % 2) * 2 - 1) * 0.5    # 左右交替
    arp[i0:i1, 0] += v * (1 - pan)
    arp[i0:i1, 1] += v * pan

# ping-pong delay(附點八分)
dl = int(step * 1.5 * SR)
fb = 0.38
buf = arp.copy()
tap = arp.copy()
for _ in range(6):
    shifted = np.zeros_like(tap)
    shifted[dl:, 0] = tap[:-dl, 1] * fb          # 交叉:左延遲來自右
    shifted[dl:, 1] = tap[:-dl, 0] * fb
    buf += shifted
    tap = shifted
arp = buf

# ---------- 3. SUB BASS(帶 sidechain 律動)----------
bass = np.zeros(n_ext)
beat_phase = (t % beat) / beat
duck = 1 - 0.55 * np.exp(-((t % beat) / 0.10) ** 2)   # 每拍下沉一下
for k in range(CYCLES * LOOP_BARS // 2):
    tstart = k * SEG
    ch = CHORDS[k % 4]
    i0 = int(tstart * SR)
    i1 = int(min((tstart + SEG + 0.2) * SR, n_ext))
    lt = (np.arange(i0, i1) - i0) / SR
    env = np.clip(lt / 0.05, 0, 1) * np.clip((SEG + 0.2 - lt) / 0.25, 0, 1)
    f = ch["bass"]
    v = (np.sin(2 * np.pi * f * lt) + 0.25 * np.sin(2 * np.pi * 2 * f * lt)) * env
    bass[i0:i1] += v * 0.5
bass *= duck

# ---------- 4. 空氣感高頻 ----------
air = np.zeros((n_ext, 2))
for k in range(CYCLES * LOOP_BARS // 2):
    tstart = k * SEG
    ch = CHORDS[k % 4]
    i0 = int(tstart * SR); i1 = int(min((tstart + SEG + 1.0) * SR, n_ext))
    lt = (np.arange(i0, i1) - i0) / SR
    env = np.clip(lt / 1.0, 0, 1) * np.clip((SEG + 1.0 - lt) / 1.2, 0, 1)
    am = 0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * t[i0:i1] + k)
    for j, f in enumerate(ch["notes"]):
        v = np.sin(2 * np.pi * f * 4 * lt + rng.uniform(0, 6.3)) * env * am * 0.012
        air[i0:i1, 0] += v * (0.3 + 0.4 * (j % 2))
        air[i0:i1, 1] += v * (0.7 - 0.4 * (j % 2))
# 低量星塵噪音
noise = rng.standard_normal(n_ext)
b, a = [0.0008], [1, -0.999]                     # 低通到極低頻的近似 → 用簡單一階高通反而給「風」感
from scipy.signal import butter
bb, aa = butter(2, [3000 / (SR / 2), 8000 / (SR / 2)], btype="band")
wind = lfilter(bb, aa, noise) * 0.02
air[:, 0] += wind * (0.7 + 0.3 * np.sin(2 * np.pi * 0.05 * t))
air[:, 1] += wind * (0.7 + 0.3 * np.cos(2 * np.pi * 0.05 * t))

# ---------- 5. 輕柔 KICK(第二輪起,拍 1 & 3)----------
kick = np.zeros(n_ext)
for s in range(int(n_ext / (SR * beat))):
    tb = s * beat
    if tb < prog_len:            # 第一輪不放 kick,留白
        continue
    if s % 2 != 0:
        continue
    i0 = int(tb * SR); i1 = int(min((tb + 0.35) * SR, n_ext))
    lt = (np.arange(i0, i1) - i0) / SR
    pitch = 48 * np.exp(-lt * 28) + 40
    v = np.sin(2 * np.pi * pitch * lt) * np.exp(-lt * 9)
    kick[i0:i1] += v * 0.16

# ---------- Freeverb 式殘響(套在 pad + arp + air)----------
def comb(x, delay, fb, damp):
    y = np.zeros_like(x)
    buf = np.zeros(delay)
    filt = 0.0
    # 分塊處理太慢;用 lfilter 近似:一階阻尼回授梳狀濾波
    # y[i] = x[i] + fb*( (1-damp)*y[i-delay] + damp*filt )  → 用遞迴
    # 簡化:先做純回授梳狀,再一階低通
    a = np.zeros(delay + 1); a[0] = 1.0; a[delay] = -fb
    y = lfilter([1.0], a, x)
    lb, la = butter(1, 4500 / (SR / 2), btype="low")
    return lfilter(lb, la, y) * (1 - fb)

def allpass(x, delay, g):
    a = np.zeros(delay + 1); a[0] = 1.0; a[delay] = -g
    bff = np.zeros(delay + 1); bff[0] = -g; bff[delay] = 1.0
    return lfilter(bff, a, x)

def reverb(mono):
    combs = [1116, 1188, 1277, 1356, 1422, 1491]
    combs = [int(c * SR / 44100) for c in combs]
    acc = np.zeros_like(mono)
    for d in combs:
        acc += comb(mono, d, 0.84, 0.2)
    acc /= len(combs)
    for d in (556, 441, 341, 225):
        acc = allpass(acc, int(d * SR / 44100), 0.5)
    return acc

wet_src_L = pad[:, 0] + arp[:, 0] * 0.9 + air[:, 0]
wet_src_R = pad[:, 1] + arp[:, 1] * 0.9 + air[:, 1]
revL = reverb(wet_src_L)
revR = reverb(wet_src_R)

# ---------- 混音 ----------
airL = air[:, 0] * 2.2
airR = air[:, 1] * 2.2
L = pad[:, 0] + arp[:, 0] + airL + bass * 0.58 + kick * 0.55 + 0.22 * revL
R = pad[:, 1] + arp[:, 1] + airR + bass * 0.58 + kick * 0.55 + 0.22 * revR
mix = np.stack([L, R], axis=1)

# 主匯流排:高通去掉極低頻的隆隆聲 + 高頻 shelf 增添空氣感
hb, ha = butter(2, 32 / (SR / 2), btype="high")
sb, sa = butter(2, 6500 / (SR / 2), btype="high")
for c in range(2):
    mix[:, c] = lfilter(hb, ha, mix[:, c])
    mix[:, c] = mix[:, c] + 0.5 * lfilter(sb, sa, mix[:, c])

# 尾巴(殘響 / release)折回開頭 → 循環時前一輪的尾音自然接上
head = mix[:n].copy()
tail = mix[n:n_ext]
tl = len(tail)
head[:tl] += tail
out = head

# 兩端各 12ms 微淡入 / 淡出 → 接縫必為零,循環無爆音(pad 樂聽不出這點音量凹陷)
fl = int(0.012 * SR)
out[:fl] *= np.linspace(0, 1, fl)[:, None]
out[-fl:] *= np.linspace(1, 0, fl)[:, None]

# 音量壓到背景樂該有的水位(~ -13 dBFS RMS)+ 軟限幅
out = out * 0.62
out = np.tanh(out * 1.0)
peak = np.max(np.abs(out))
out = out / peak * 0.82

# 寫 16-bit stereo WAV
i16 = np.clip(out * 32767, -32768, 32767).astype("<i2")
path = os.path.join(os.path.dirname(__file__), "..", "assets", "music.wav")
path = os.path.abspath(path)
with wave.open(path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(i16.tobytes())

print(f"wrote {path}")
print(f"  {T:.1f}s  {SR}Hz stereo  {os.path.getsize(path)/1048576:.1f} MB  peak {peak:.2f}")
