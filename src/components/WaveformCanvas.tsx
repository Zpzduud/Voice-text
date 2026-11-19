import { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  active: boolean;
  analyserNode: AnalyserNode | null;
  audioLevel: number;
  isOffline: boolean;
}

export function WaveformCanvas({
  active,
  analyserNode,
  audioLevel,
  isOffline,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const dataArray = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    const render = (time: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const barCount = 48;
      const gap = 4;
      const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
      const centerY = height / 2;

      if (analyserNode && dataArray && active) {
        analyserNode.getByteFrequencyData(dataArray);
      }

      const activeColor = isOffline ? '#D97706' : '#1D4ED8';
      const idleColor = '#CBD5E1';

      for (let i = 0; i < barCount; i += 1) {
        let magnitude = 0.08;
        if (active) {
          if (dataArray && analyserNode) {
            const idx = Math.min(dataArray.length - 1, Math.floor((i / barCount) * (dataArray.length * 0.65)));
            magnitude = Math.max(0.12, dataArray[idx] / 255);
          } else {
            const wave = Math.sin(time * 0.008 + i * 0.45) * 0.5 + 0.5;
            magnitude = 0.16 + wave * Math.max(0.3, audioLevel);
          }
        } else {
          // Subtle calm baseline
          magnitude = 0.08 + Math.sin(i * 0.35) * 0.03;
        }

        const barHeight = Math.max(3, magnitude * (height * 0.82));
        const x = i * (barWidth + gap);
        const y = centerY - barHeight / 2;

        ctx.fillStyle = active ? activeColor : idleColor;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }

      ctx.restore();
      if (active) {
        animId = window.requestAnimationFrame(render);
      }
    };

    animId = window.requestAnimationFrame(render);
    return () => {
      if (animId) window.cancelAnimationFrame(animId);
    };
  }, [active, analyserNode, audioLevel, isOffline]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="voice-waveform-canvas"
      aria-label={active ? 'Live microphone audio waveform' : 'Idle audio waveform'}
      className="h-14 w-full block"
    />
  );
}
