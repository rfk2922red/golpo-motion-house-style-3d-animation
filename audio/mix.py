import numpy as np, subprocess, re, json
from scipy.io import wavfile
from scipy import signal
SR=48000
def lufs(y,tmp='/tmp/_m.wav'):
    wavfile.write(tmp,SR,(np.clip(y,-1,1)*32767).astype(np.int16))
    o=subprocess.run(['ffmpeg','-hide_banner','-i',tmp,'-af','ebur128','-f','null','-'],capture_output=True,text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS',o)[-1])
sfx=np.load('sfx_raw.npy').T; mus=np.load('mus_raw.npy').T
N=sfx.shape[0]
_,v=wavfile.read('voice48.wav'); v=v.astype(np.float64)/32768
vo=np.zeros(N); vo[:min(N,len(v))]=v[:N]
VG=10**(4/20); vo*=VG
vL=lufs(np.stack([vo,vo],1)); print('voice LUFS',vL)
# duck envelope from voice rms
w=int(0.05*SR); e=np.sqrt(np.convolve(vo**2,np.ones(w)/w,'same'))
e=np.clip(e/np.percentile(e[e>0.01],90),0,1)
def smooth(e,a,r):
    out=np.zeros_like(e); y=0
    ak=1-np.exp(-1/(a*SR)); rk=1-np.exp(-1/(r*SR))
    for i,x in enumerate(e[::48]):
        k=ak if x>y else rk
        y+= (x-y)*(1-(1-k)**48); out[i*48:(i+1)*48]=y
    return out[:len(e)]
env=smooth(e,0.08,0.45)
def duck(db): return 10**((-db*env)/20)
mD=duck(9); sD=duck(4)
musd=mus*mD[:,None]; sfxd=sfx*sD[:,None]
tgtM=-28.0; tgtS=-29.0
gm=10**((tgtM-lufs(musd))/20); gs=10**((tgtS-lufs(sfxd))/20)
print('music gain',round(20*np.log10(gm),1),'dB; sfx gain',round(20*np.log10(gs),1),'dB')
musd*=gm; sfxd*=gs
voice2=np.stack([vo,vo],1)
mix=voice2+musd+sfxd
# gentle safety limiter
pk=np.max(np.abs(mix)); print('pre peak',pk)
thr=0.89
g=np.minimum(1,thr/np.maximum(np.abs(mix).max(1),1e-9)); g=signal.sosfilt(signal.butter(1,30,'low',fs=SR,output='sos'),g); g=np.minimum(g,np.minimum(1,thr/np.maximum(np.abs(mix).max(1),1e-9)))
mix=mix*g[:,None]
print('final LUFS',lufs(mix),'peak',np.max(np.abs(mix)))
def save(n,y): wavfile.write(n,SR,(np.clip(y,-1,1)*32767).astype(np.int16))
save('mix.wav',mix); save('music.wav',mus*gm); save('sfx.wav',sfx*gs)
print('music stem LUFS',lufs(musd),'sfx stem',lufs(sfxd))
