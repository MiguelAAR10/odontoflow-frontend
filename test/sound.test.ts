import { afterEach, expect, test, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });
test('se puede importar y consultar en SSR sin window', async () => {
    vi.stubGlobal('window', undefined);
    const { sound } = await import('../src/lib/sound.js');
    expect(sound.enabled).toBe(true);
    expect(() => sound.play('done', 'airi')).not.toThrow();
});
function browser(search = '', stored: string | null = null) {
    const node = () => ({ connect: vi.fn(), gain: param(), frequency: param(), Q: param(),
        threshold: param(), ratio: param(), attack: param(), release: param() });
    const oscillators: ReturnType<typeof oscillator>[] = [];
    const filters: ReturnType<typeof node>[] = [];
    function param() { return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
    function oscillator() { return { ...node(), start: vi.fn(), stop: vi.fn() }; }
    const context = {
        sampleRate: 1000, currentTime: 1, state: 'running', destination: {},
        createGain: vi.fn(node), createBiquadFilter: vi.fn(() => { const n = node(); filters.push(n); return n; }),
        createDynamicsCompressor: vi.fn(node), createConvolver: vi.fn(node),
        createBuffer: vi.fn((_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
        createOscillator: vi.fn(() => { const o = oscillator(); oscillators.push(o); return o; }),
        createBufferSource: vi.fn(() => ({ ...oscillator(), playbackRate: param() })),
        resume: vi.fn(async () => { }), suspend: vi.fn(async () => { }),
    };
    const AudioContext = vi.fn(function () { return context; });
    const storage = { getItem: vi.fn(() => stored), setItem: vi.fn() };
    const win = Object.assign(new EventTarget(), { location: { search }, localStorage: storage, AudioContext });
    vi.stubGlobal('window', win);
    return { win, context, AudioContext, storage, oscillators, filters };
}
test('no crea contexto al importar, consultar, suscribirse ni reproducir antes del primer gesto', async () => {
    const b = browser();
    const { sound } = await import('../src/lib/sound.js');
    expect(b.storage.getItem).not.toHaveBeenCalled();
    expect(sound.enabled).toBe(true);
    const unsubscribe = sound.subscribe(vi.fn());
    sound.play('done');
    sound.setEnabled(true);
    expect(b.AudioContext).not.toHaveBeenCalled();
    b.win.dispatchEvent(new Event('pointerdown'));
    expect(b.AudioContext).toHaveBeenCalledTimes(1);
    sound.play('done');
    expect(b.oscillators).toHaveLength(5);
    b.win.dispatchEvent(new Event('keydown'));
    expect(b.AudioContext).toHaveBeenCalledTimes(1);
    unsubscribe();
});
test('sound=0 impide contexto, reproducción y reactivación incluso tras gestos', async () => {
    const b = browser('?sound=0');
    const { sound } = await import('../src/lib/sound.js');
    const changed = vi.fn();
    sound.subscribe(changed);
    sound.setEnabled(true);
    b.win.dispatchEvent(new Event('pointerdown'));
    b.win.dispatchEvent(new Event('keydown'));
    for (const name of ['key', 'send', 'start', 'done', 'needs', 'approved', 'error'] as const)
        sound.play(name);
    expect(sound.enabled).toBe(false);
    expect(b.AudioContext).not.toHaveBeenCalled();
    expect(b.storage.setItem).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
});
test('lee airi.sound, persiste cambios y permite cancelar la suscripción', async () => {
    const b = browser('', '0');
    const { sound } = await import('../src/lib/sound.js');
    expect(sound.enabled).toBe(false);
    expect(b.storage.getItem).toHaveBeenCalledWith('airi.sound');
    b.win.dispatchEvent(new Event('pointerdown'));
    expect(b.AudioContext).not.toHaveBeenCalled();
    const states: boolean[] = [];
    const unsubscribe = sound.subscribe(() => states.push(sound.enabled));
    sound.setEnabled(true);
    expect(b.storage.setItem).toHaveBeenLastCalledWith('airi.sound', '1');
    expect(b.AudioContext).toHaveBeenCalledTimes(1);
    sound.setEnabled(false);
    expect(b.storage.setItem).toHaveBeenLastCalledWith('airi.sound', '0');
    expect(b.context.suspend).toHaveBeenCalledOnce();
    expect(states).toEqual([true, false]);
    unsubscribe();
    sound.setEnabled(true);
    expect(states).toEqual([true, false]);
});
test('tolera que el acceso a localStorage lance', async () => {
    const b = browser();
    Object.defineProperty(b.win, 'localStorage', { get() { throw new Error('SecurityError'); } });
    const { sound } = await import('../src/lib/sound.js');
    expect(sound.enabled).toBe(true);
    expect(() => { sound.setEnabled(false); sound.setEnabled(true); }).not.toThrow();
    expect(sound.enabled).toBe(true);
    expect(b.AudioContext).not.toHaveBeenCalled();
});
test('el tecleo respeta 35 ms incluso si el primer tiempo es cero', async () => {
    const b = browser();
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => { });
    b.win.dispatchEvent(new Event('keydown'));
    sound.play('key');
    now.mockReturnValue(34);
    sound.play('key');
    expect(b.context.createBufferSource).toHaveBeenCalledTimes(1);
    now.mockReturnValue(35);
    sound.play('key');
    expect(b.context.createBufferSource).toHaveBeenCalledTimes(2);
});
test.each([
    ['airi', 196], ['cepillo', 220], ['pasta', 261.63], ['hilo', 293.66],
    ['enjuague', 329.63], ['espejo', 392], ['escudo', 440],
] as const)('start usa la nota V10 de %s', async (agent, frequency) => {
    const b = browser();
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => { });
    b.win.dispatchEvent(new Event('pointerdown'));
    sound.play('start', agent);
    expect(b.oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(frequency, 1.005);
    expect(b.oscillators[0]?.stop).toHaveBeenCalledWith(1.195);
});
test.each([
    ['send', [293.66, 587.32]],
    ['done', [196, 392, 588, 245, 490]],
    ['needs', [196, 392, 588, 294, 588, 882]],
    ['approved', [196, 392, 246.94, 493.88, 293.66, 587.32, 98]],
    ['error', [185, 146.83]],
] as const)('%s conserva las frecuencias V10', async (name, frequencies) => {
    const b = browser();
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => { });
    b.win.dispatchEvent(new Event('pointerdown'));
    sound.play(name);
    expect(b.oscillators.map(o => o.frequency.setValueAtTime.mock.calls[0]?.[0])).toEqual(frequencies);
});
test('tolera Web Audio ausente, constructor bloqueado y resume rechazado', async () => {
    const b = browser();
    b.AudioContext.mockImplementationOnce(() => { throw new Error('blocked'); });
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => { });
    expect(() => b.win.dispatchEvent(new Event('pointerdown'))).not.toThrow();
    b.context.state = 'suspended';
    b.context.resume.mockRejectedValue(new Error('denied'));
    expect(() => sound.play('send')).not.toThrow();
    await Promise.resolve();
    expect(b.context.resume).toHaveBeenCalled();
});

test('degrada a silencio cuando el navegador no ofrece Web Audio', async () => {
    const b = browser();
    Object.defineProperty(b.win, 'AudioContext', { value: undefined });
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => {});
    expect(() => b.win.dispatchEvent(new Event('keydown'))).not.toThrow();
    expect(() => sound.play('error')).not.toThrow();
    expect(b.oscillators).toHaveLength(0);
});

test('conserva el filtro de 3,8 kHz, compresor y sala corta de V10', async () => {
    const b = browser();
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => {}); b.win.dispatchEvent(new Event('pointerdown'));
    const lp = b.filters[0];
    const compressor = b.context.createDynamicsCompressor.mock.results[0]?.value;
    const master = b.context.createGain.mock.results[0]?.value;
    const wet = b.context.createGain.mock.results[1]?.value;
    const verb = b.context.createConvolver.mock.results[0]?.value;
    expect(lp?.frequency.value).toBe(3800);
    expect(lp?.Q.value).toBe(.4);
    expect(master?.gain.value).toBe(.32);
    expect(compressor?.threshold.value).toBe(-22);
    expect(compressor?.ratio.value).toBe(3);
    expect(compressor?.attack.value).toBe(.003);
    expect(compressor?.release.value).toBe(.2);
    expect(master?.connect).toHaveBeenCalledWith(lp);
    expect(lp?.connect).toHaveBeenCalledWith(compressor);
    expect(compressor?.connect).toHaveBeenCalledWith(b.context.destination);
    expect(b.context.createBuffer).toHaveBeenCalledWith(2, 700, 1000);
    expect(wet?.gain.value).toBe(.18);
    expect(verb?.connect).toHaveBeenCalledWith(wet);
    expect(wet?.connect).toHaveBeenCalledWith(lp);
});

test.each([
    ['send', 120], ['start', 250], ['done', 650], ['needs', 600], ['approved', 400], ['error', 500],
] as const)('%s limita repetición durante %i ms', async (name, ms) => {
    const b = browser();
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => {}); b.win.dispatchEvent(new Event('pointerdown'));
    sound.play(name);
    const count = b.oscillators.length;
    now.mockReturnValue(ms - 1); sound.play(name);
    expect(b.oscillators).toHaveLength(count);
    now.mockReturnValue(ms); sound.play(name);
    expect(b.oscillators).toHaveLength(count * 2);
});

test('el límite de start es independiente por agente', async () => {
    const b = browser();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { sound } = await import('../src/lib/sound.js');
    sound.subscribe(() => {}); b.win.dispatchEvent(new Event('pointerdown'));
    sound.play('start', 'airi'); sound.play('start', 'pasta'); sound.play('start', 'airi');
    expect(b.oscillators).toHaveLength(6);
});
