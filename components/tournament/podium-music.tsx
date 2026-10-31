'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { pausePodiumMusic, PODIUM_MUSIC_TRACKS, startPodiumMusic, type PodiumTrackId } from '@/lib/tournament/podium-music';

export interface PodiumMusicControls { restart(): void; pause(): void }

export const PodiumMusic = forwardRef<PodiumMusicControls>(function PodiumMusic(_props, ref) {
  const [selectedId, setSelectedId] = useState<PodiumTrackId | ''>('');
  const [volume, setVolume] = useState(25);
  const [issue, setIssue] = useState('');
  const track = PODIUM_MUSIC_TRACKS.find((item) => item.id === selectedId);
  const audio = useRef<HTMLAudioElement>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const volumeRef = useRef(25);
  const request = useRef(0);

  const play = useCallback((restart: boolean) => {
    const element = audio.current;
    if (!element) return;
    const version = ++request.current;
    setIssue('');
    void startPodiumMusic(element, restart).then((ok) => {
      if (version === request.current && !ok) {
        setIssue('Não foi possível tocar a música. Use Tocar música ou os controles de áudio. A premiação pode continuar sem som.');
        if (panel.current) panel.current.open = true;
      }
    });
  }, []);
  const pause = useCallback(() => { request.current++; pausePodiumMusic(audio.current); }, []);

  useImperativeHandle(ref, () => ({
    restart() { if (panel.current) panel.current.open = false; play(true); },
    pause,
  }), [play, pause]);

  useEffect(() => {
    const element = audio.current;
    if (!element || !track) return;
    // Restore after Strict Mode cleanup, without starting playback or downloading.
    if (element.getAttribute('src') !== track.src) {
      element.setAttribute('src', track.src); element.load();
    }
    try { element.volume = volumeRef.current / 100; } catch { setIssue('Ajuste o volume nos controles de áudio ou no aparelho.'); }
    return () => {
      request.current++;
      pausePodiumMusic(element);
      element.removeAttribute('src');
      element.load();
    };
  }, [track]);

  return (
    <details ref={panel} aria-label="Música do pódio" className="relative z-10 mx-auto mb-4 max-w-3xl rounded-xl border border-white/20 bg-black/15 px-3 py-2 sm:px-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Música · {track?.name ?? 'Sem música'}</summary>
      <div className="mt-2 space-y-3 pb-2">
      <label className="block text-sm font-semibold" htmlFor="podium-music">Música do pódio</label>
      <select id="podium-music" value={selectedId} onChange={(event) => {
        pause(); setIssue(''); setSelectedId(event.target.value as PodiumTrackId | '');
      }} className="min-h-11 w-full rounded-lg border border-white/30 bg-brand-950 px-3 py-2 text-white">
        <option value="">Sem música</option>
        {PODIUM_MUSIC_TRACKS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <p className="text-xs text-brand-200">Somente áudio, sem vídeo. Só este painel será afetado. Recolher os controles não interrompe a música.</p>
      {track && (
        <>
          <audio key={track.id} ref={audio} src={track.src} controls loop preload="none" aria-label={`Áudio: ${track.name}`} className="w-full"
            onPlay={() => setIssue('')} onPause={() => { request.current++; }}
            onError={(event) => {
              if (event.currentTarget !== audio.current) return;
              setIssue('Não foi possível carregar esta faixa. Tente tocar novamente ou escolha a outra música.');
              if (panel.current) panel.current.open = true;
            }}
            onVolumeChange={(event) => { const value = Math.round(event.currentTarget.volume * 100); volumeRef.current = value; setVolume(value); }}>
            Seu navegador não suporta reprodução de áudio.
          </audio>
          <label className="block text-sm font-semibold">Volume · {volume}%
            <input aria-label="Volume da música" type="range" min={0} max={100} step={1} value={volume} className="mt-2 block w-full accent-amber-300" onChange={(event) => {
              const value = Number(event.target.value); setVolume(value); volumeRef.current = value;
              try { if (audio.current) audio.current.volume = value / 100; } catch { setIssue('Ajuste o volume diretamente no aparelho.'); }
            }} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => play(false)} className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">Tocar música</button>
            <button type="button" onClick={pause} className="min-h-11 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:bg-white/10">Pausar música</button>
          </div>
          <p role={issue ? 'alert' : 'status'} className="text-xs text-brand-100">{issue || 'Iniciar ou repetir a apresentação recomeça a faixa selecionada. Você também pode tocar e pausar separadamente.'}</p>
        </>
      )}
      </div>
    </details>
  );
});
