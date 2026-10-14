/** Web Audio synthesis ported from agente-v10. Importing this module is SSR-safe.
 * The first API access arms gesture listeners; play() before a gesture is silent.
 * UI wiring and AG-UI event mapping belong to useAgentSounds (D4).
 */
export type SoundAgent = 'airi' | 'cepillo' | 'pasta' | 'hilo' | 'enjuague' | 'espejo' | 'escudo';
export type SoundName = 'key' | 'send' | 'start' | 'done' | 'needs' | 'approved' | 'error';
type VoiceOptions = {
    at?: number;
    dur?: number;
    gain?: number;
    type?: OscillatorType;
    parts?: [
        number,
        number
    ][];
    send?: number;
    glide?: number;
    lpf?: number;
};
const NOTE: Record<SoundAgent, number> = { airi: 196, cepillo: 220, pasta: 261.63, hilo: 293.66, enjuague: 329.63, espejo: 392, escudo: 440 };
const TIMBRE: Record<SoundAgent, number> = { airi: .10, cepillo: .06, pasta: .12, hilo: .05, enjuague: .08, espejo: .04, escudo: .09 };
let on = true, muted = false, prepared = false, gestured = false;
let ac: AudioContext | null = null;
let bus: GainNode | null = null, verb: ConvolverNode | null = null, noise: AudioBuffer | null = null;
const last: Record<string, number> = {};
const listeners = new Set<() => void>();
function prepare() {
    if (prepared || typeof window === 'undefined')
        return;
    prepared = true;
    muted = new URLSearchParams(window.location.search).get('sound') === '0';
    try {
        on = window.localStorage.getItem('airi.sound') !== '0';
    }
    catch { /* Optional storage. */ }
    if (muted) {
        on = false;
        return;
    }
    const unlock = () => { gestured = true; ok(); };
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true, passive: true });
}
function init() {
    if (ac || !on || !gestured || muted)
        return;
    const C = window.AudioContext || (window as Window & {
        webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!C)
        return;
    try {
        ac = new C();
    }
    catch (e) {
        return;
    }
    const master = ac.createGain();
    master.gain.value = .32; /* volumen maestro bajo */
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    lp.Q.value = .4; /* sin pitidos agudos */
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.ratio.value = 3;
    comp.attack.value = .003;
    comp.release.value = .2;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ac.destination);
    /* sala pequeña: impulso de ruido que decae (da el acabado «de app de Mac») */
    const len = Math.round(ac.sampleRate * .7), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++)
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
    }
    verb = ac.createConvolver();
    verb.buffer = ir;
    const wet = ac.createGain();
    wet.gain.value = .18;
    verb.connect(wet);
    wet.connect(lp);
    noise = ac.createBuffer(1, Math.round(ac.sampleRate * .06), ac.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++)
        nd[i] = Math.random() * 2 - 1;
    bus = master;
}
function ok(): boolean {
    prepare();
    if (!on || muted || !gestured) return false;
    init();
    if (!ac) return false;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    return true;
}
function gap(k: string, ms: number): boolean {
    const n = performance.now();
    if (last[k] !== undefined && n - last[k] < ms) return false;
    last[k] = n;
    return true;
}
/* voz: seno + parciales suaves, ataque corto y caída exponencial */
function voice(f: number, { at = 0, dur = .5, gain = .12, type = 'sine', parts = [[2, .06]], send = .25, glide = 0, lpf = 0 }: VoiceOptions = {}) {
    if (!ac || !bus || !verb)
        return;
    const t = ac.currentTime + .005 + at, g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + .006);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let dst: AudioNode = g;
    if (lpf) {
        const f2 = ac.createBiquadFilter();
        f2.type = 'lowpass';
        f2.frequency.value = lpf;
        g.connect(f2);
        dst = f2;
    }
    else
        dst = g;
    dst.connect(bus);
    if (send) {
        const s = ac.createGain();
        s.gain.value = send;
        dst.connect(s);
        s.connect(verb);
    }
    const partials: [number, number][] = [[1, 1], ...parts];
    partials.forEach(([m, a], i) => {
        const o = ac!.createOscillator();
        o.type = i ? 'sine' : type;
        o.frequency.setValueAtTime(f * m, t);
        if (glide)
            o.frequency.exponentialRampToValueAtTime(f * m * glide, t + Math.min(.09, dur));
        const og = ac!.createGain();
        og.gain.value = a;
        o.connect(og);
        og.connect(g);
        o.start(t);
        o.stop(t + dur + .05);
    });
}
function click(f: number, gain: number, dur: number) {
    if (!ac || !bus)
        return;
    const t = ac.currentTime + .002, s = ac.createBufferSource();
    s.buffer = noise;
    s.playbackRate.value = .9 + Math.random() * .2;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 1.1;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(bus);
    s.start(t);
    s.stop(t + dur + .01);
}
const P = {
    /* tecleo: clic muy suave con variación leve de tono */
    key() {
        if (!ok() || !gap('key', 35))
            return;
        click(1500 + Math.random() * 450, .05, .028);
        voice(150 + Math.random() * 30, { dur: .04, gain: .035, parts: [], send: 0 });
    },
    /* enviar: pulsación cálida que sube un tono */
    send() {
        if (!ok() || !gap('send', 120))
            return;
        voice(293.66, { dur: .2, gain: .09, glide: 1.335, parts: [[2, .05]], send: .2 });
        click(900, .025, .06);
    },
    /* agente empieza: tick de su nota, como marimba apagada */
    start(k: SoundAgent = 'airi') {
        if (!ok() || !gap('start' + k, 250))
            return;
        const f = NOTE[k] || NOTE.airi;
        voice(f, { dur: .14, gain: .085, parts: [[4, .025], [2, TIMBRE[k] || .06]], send: .15 });
    },
    /* agente termina / tarjeta lista: acorde breve de 2 notas (tercera mayor justa), el más bonito */
    done(k: SoundAgent = 'airi') {
        if (!ok() || !gap('done', 650))
            return;
        const f = NOTE[k] || NOTE.airi;
        voice(f, { dur: 1.0, gain: .08, parts: [[2, TIMBRE[k] || .06], [3, .015]], send: .35 });
        voice(f * 5 / 4, { at: .075, dur: 1.1, gain: .07, parts: [[2, .05]], send: .4 });
    },
    /* necesita tu aprobación: dos notas ascendentes suaves */
    needs(k: SoundAgent = 'airi') {
        if (!ok() || !gap('needs', 600))
            return;
        const f = NOTE[k] || NOTE.airi;
        voice(f, { dur: .32, gain: .08, parts: [[2, .05], [3, .02]], send: .25 });
        voice(f * 3 / 2, { at: .14, dur: .5, gain: .085, parts: [[2, .05], [3, .02]], send: .3 });
    },
    /* aprobado en la tarjeta: confirmación cálida (tríada grave escalonada) */
    approved() {
        if (!ok() || !gap('ok', 400))
            return;
        [196, 246.94, 293.66].forEach((f, i) => voice(f, { at: i * .045, dur: .75, gain: .075, parts: [[2, .07]], send: .3, lpf: 2400 }));
        voice(98, { dur: .5, gain: .06, parts: [], send: 0 });
    },
    /* error: grave y discreto, dos notas que bajan */
    error() {
        if (!ok() || !gap('err', 500))
            return;
        voice(185, { dur: .22, gain: .1, type: 'triangle', parts: [], send: .1, lpf: 700 });
        voice(146.83, { at: .12, dur: .32, gain: .1, type: 'triangle', parts: [], send: .1, lpf: 600 });
    },
};
export const sound = {
    get enabled(): boolean { prepare(); return on; },
    play(name: SoundName, agent?: SoundAgent): void { P[name](agent); },
    setEnabled(value: boolean): void {
        prepare();
        if (typeof window === 'undefined' || muted || on === value)
            return;
        on = value;
        try {
            window.localStorage.setItem('airi.sound', on ? '1' : '0');
        }
        catch { /* Optional storage. */ }
        if (on) {
            P.approved();
        }
        else if (ac?.state === 'running') {
            void ac.suspend().catch(() => { });
        }
        for (const listener of listeners)
            listener();
    },
    /** Subscription callbacks read enabled; the returned function removes the listener. */
    subscribe(listener: () => void): () => void {
        prepare();
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};
