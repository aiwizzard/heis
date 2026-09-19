import React, { useEffect, useRef } from "react";
import { drawEditorText, renderFrame, applyColor, hasColor } from "@heis/core";
import type { EditorProject, Sequence } from "@heis/core";

export function assetUrl(projectId: string, relative: string): string {
  return `heis-project://${projectId}/${relative.split("/").map(encodeURIComponent).join("/")}`;
}
type MediaNode = {
  element: HTMLVideoElement | HTMLImageElement;
  gain?: GainNode;
  corrected?: HTMLCanvasElement;
  correctedKey?: string;
  source?: MediaElementAudioSourceNode;
};
export function Preview({
  project,
  sequence,
  frame,
  playing,
  onMeter,
  bypassColorClipId,
}: {
  bypassColorClipId?: string;
  project: EditorProject;
  sequence: Sequence;
  frame: number;
  playing: boolean;
  onMeter: (value: number) => void;
}) {
  const [tick, setTick] = React.useState(0);
  const canvas = useRef<HTMLCanvasElement>(null),
    nodes = useRef(new Map<string, MediaNode>()),
    audio = useRef<AudioContext | null>(null),
    analyser = useRef<AnalyserNode | null>(null);
  useEffect(
    () => () => {
      nodes.current.forEach((n) => {
        if (n.element instanceof HTMLVideoElement) {
          n.element.onseeked = null;
          n.element.onloadeddata = null;
          n.element.pause();
          n.element.removeAttribute("src");
          n.element.load();
        }
        if (n.element instanceof HTMLImageElement) n.element.onload = null;
        n.source?.disconnect();
      });
      nodes.current.clear();
      void audio.current?.close();
      audio.current = null;
    },
    [project.id],
  );
  useEffect(() => {
    const surface = canvas.current,
      ctx = surface?.getContext("2d");
    if (!surface || !ctx) return;
    const layers = renderFrame(project, sequence, frame),
      active = new Set<string>();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, sequence.width, sequence.height);
    for (const layer of layers) {
      const { clip, track, asset } = layer;
      if (!asset) {
        ctx.globalAlpha = layer.alpha;
        drawEditorText(ctx, clip, sequence);
        ctx.globalAlpha = 1;
        continue;
      }
      active.add(clip.id);
      let node = nodes.current.get(clip.id);
      const url = assetUrl(project.id, asset.proxyPath || asset.path);
      if (!node || node.element.dataset.assetUrl !== url) {
        if (node?.element instanceof HTMLVideoElement) node.element.pause();
        node?.source?.disconnect();
        const element =
          asset.kind === "image"
            ? new Image()
            : document.createElement("video");
        element.crossOrigin = "anonymous";
        element.src = url;
        element.dataset.assetUrl = url;
        const repaint = () => {
          const current = nodes.current.get(clip.id);
          if (current) current.correctedKey = undefined;
          setTick((value) => value + 1);
        };
        if (element instanceof HTMLVideoElement) {
          element.onseeked = repaint;
          element.onloadeddata = repaint;
        } else element.onload = repaint;
        node = { element };
        nodes.current.set(clip.id, node);
        if (element instanceof HTMLVideoElement) {
          element.preload = "auto";
          element.playsInline = true;
          element.muted = track.kind !== "audio";
          if (track.kind === "audio") {
            if (!audio.current) {
              audio.current = new AudioContext();
              analyser.current = audio.current.createAnalyser();
              analyser.current.fftSize = 256;
              analyser.current.connect(audio.current.destination);
            }
            node.source = audio.current.createMediaElementSource(element);
            node.gain = audio.current.createGain();
            node.source.connect(node.gain);
            node.gain.connect(analyser.current!);
          }
        }
      }
      const element = node.element;
      if (element instanceof HTMLVideoElement) {
        if (
          Math.abs(element.currentTime - layer.sourceSeconds) >
          (playing ? 0.15 : 0.015)
        )
          element.currentTime = layer.sourceSeconds;
        if (node.gain) node.gain.gain.value = layer.gain;
        if (playing) {
          if (audio.current?.state === "suspended") void audio.current.resume();
          if (element.paused) void element.play().catch(() => {});
        } else element.pause();
        if (element.readyState < 2) continue;
      } else if (!element.complete || !element.naturalWidth) continue;
      if (track.kind === "audio" || !layer.alpha) continue;
      const width =
          element instanceof HTMLVideoElement
            ? element.videoWidth
            : element.naturalWidth,
        height =
          element instanceof HTMLVideoElement
            ? element.videoHeight
            : element.naturalHeight;
      if (!width || !height) continue;
      let visual: CanvasImageSource = element;
      if (hasColor(clip.color) && clip.id !== bypassColorClipId) {
        const key = JSON.stringify([clip.color, element instanceof HTMLVideoElement ? element.currentTime : 0]);
        if (!node.corrected) node.corrected = document.createElement("canvas");
        if (node.correctedKey !== key) {
          node.corrected.width = width;
          node.corrected.height = height;
          const colorContext = node.corrected.getContext("2d", { willReadFrequently: true })!;
          colorContext.drawImage(element, 0, 0);
          const pixels = colorContext.getImageData(0, 0, width, height);
          applyColor(pixels.data, clip.color!);
          colorContext.putImageData(pixels, 0, 0);
          node.correctedKey = key;
        }
        visual = node.corrected;
      }
      const crop = clip.crop,
        sw = width * (1 - crop.left - crop.right),
        sh = height * (1 - crop.top - crop.bottom);
      const scale =
        (clip.fit === "fill"
          ? Math.max(sequence.width / sw, sequence.height / sh)
          : Math.min(sequence.width / sw, sequence.height / sh)) * clip.scale;
      ctx.save();
      ctx.globalAlpha = layer.alpha;
      ctx.translate(clip.x * sequence.width, clip.y * sequence.height);
      ctx.rotate((clip.rotation * Math.PI) / 180);
      ctx.drawImage(
        visual,
        width * crop.left,
        height * crop.top,
        sw,
        sh,
        (-sw * scale) / 2,
        (-sh * scale) / 2,
        sw * scale,
        sh * scale,
      );
      ctx.restore();
    }
    nodes.current.forEach((node, id) => {
      if (!active.has(id)) {
        if (node.element instanceof HTMLVideoElement) {
          node.element.onseeked = null;
          node.element.onloadeddata = null;
          node.element.pause();
          node.element.removeAttribute("src");
          node.element.load();
        }
        node.source?.disconnect();
        node.gain?.disconnect();
        nodes.current.delete(id);
      }
    });
    if (analyser.current) {
      const data = new Uint8Array(analyser.current.fftSize);
      analyser.current.getByteTimeDomainData(data);
      onMeter(Math.max(...data.map((v) => Math.abs(v - 128))) / 128);
    } else onMeter(0);
  }, [project, sequence, frame, playing, bypassColorClipId, onMeter, tick]);
  // Repaint paused images after the decoder finishes seeking or loading.
  useEffect(() => {
    if (playing) return;
    const timer = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(timer);
  }, [playing]);
  return (
    <canvas
      ref={canvas}
      width={sequence.width}
      height={sequence.height}
      aria-label="Video preview"
      style={{ aspectRatio: `${sequence.width}/${sequence.height}` }}
    />
  );
}
