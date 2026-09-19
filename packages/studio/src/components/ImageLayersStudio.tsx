import { useEffect, useRef, useState } from "react";
import { decomposeLayers, uploadFile } from "../heisProvider";
import "./imageLayers.css";

type Props = {
  apiKey: string;
  droppedFiles?: File[];
  onFilesHandled?: () => void;
  onGenerationStart?: () => void;
  onGenerationEnd?: () => void;
  onGenerationComplete?: (result: unknown) => void;
  onGenerationError?: (message: string) => void;
};

export default function ImageLayersStudio(props: Props) {
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [layers, setLayers] = useState<string[]>([]);
  const [count, setCount] = useState(4);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(-1);
  const handled = useRef<File | undefined>(undefined);
  const locked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function importImage(file: File) {
    if (locked.current) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
      setError("Choose a PNG, JPEG, or WebP image smaller than 20 MB."); return;
    }
    locked.current = true; setBusy("Uploading image…"); setError("");
    try {
      const url = await uploadFile(props.apiKey, file);
      setSource(url); setName(file.name); setLayers([]); setSelected(-1);
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { locked.current = false; setBusy(""); }
  }
  useEffect(() => {
    const file = props.droppedFiles?.[0];
    if (file && handled.current !== file) {
      handled.current = file;
      void importImage(file);
      props.onFilesHandled?.();
    }
  }, [props.droppedFiles]);

  async function separate() {
    if (!source || locked.current) return;
    locked.current = true; setBusy("Separating layers…"); setError("");
    props.onGenerationStart?.();
    try {
      const result = await decomposeLayers(props.apiKey, { image_url: source, prompt, layer_count: count });
      setLayers(result.outputs); setSelected(0);
      props.onGenerationComplete?.(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Layer separation failed.";
      setError(message); props.onGenerationError?.(message);
    } finally { locked.current = false; setBusy(""); props.onGenerationEnd?.(); }
  }
  async function download(url: string, index: number) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Download failed. Reopen this result from your library to refresh its link.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const a = document.createElement("a"); a.href = objectUrl; a.download = `layer-${index + 1}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) { setError(String(e)); }
  }
  return <section className="image-layers" aria-label="Image layers workspace"
    onDragOver={e => e.preventDefault()}
    onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void importImage(file); }}>
    <header><div><h1>Image layers</h1><p>Separate an image into transparent, editable assets.</p></div>
      <button disabled={!!busy} onClick={() => fileInput.current?.click()}>Import image</button>
      <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) void importImage(file); e.target.value = ""; }} />
    </header>
    <div className="image-layers-body">
      <main>
        <div className="image-layers-preview">
          {source ? <img src={selected < 0 ? source : layers[selected]} alt={selected < 0 ? "Source image" : `Layer ${selected + 1}`} /> :
            <button className="image-layers-empty" onClick={() => fileInput.current?.click()}><strong>Bring an image into your project</strong><span>Drop a PNG, JPEG, or WebP here, or browse files.</span></button>}
        </div>
        <div className="image-layers-caption">{source ? (selected < 0 ? name : `Layer ${selected + 1} · Transparent PNG`) : "Your source image stays unchanged."}</div>
      </main>
      <aside>
        <h2>Separate layers</h2><p>Qwen Image Layered</p>
        <label>Requested layers<select value={count} disabled={!!busy} onChange={e => setCount(Number(e.target.value))}>{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 2}>{i + 2}</option>)}</select></label>
        <label>Separation guidance <span>(optional)</span><textarea value={prompt} maxLength={32000} disabled={!!busy} onChange={e => setPrompt(e.target.value)} placeholder="For example: separate the person, product, and background." /></label>
        <p>Results preserve transparency and arrive as individual PNGs. The model may include an additional background layer.</p>
        <button className="image-layers-primary" disabled={!source || !!busy} onClick={() => void separate()}>{busy || "Separate layers"}</button>
        <p>Heis shows the credit reservation before generation starts.</p>
        {error && <p role="alert" className="image-layers-error">{error}</p>}
        {layers.length > 0 && <div className="image-layers-results"><h2>{layers.length} layers ready</h2>
          <button aria-pressed={selected < 0} onClick={() => setSelected(-1)}>View source</button>
          {layers.map((url, index) => <div className="image-layers-result" key={url}>
            <button aria-pressed={selected === index} onClick={() => setSelected(index)}><img src={url} alt="" />Layer {index + 1}</button>
            <button aria-label={`Download layer ${index + 1}`} onClick={() => void download(url, index)}>↓</button>
          </div>)}
          <p>Each layer is saved to your library. Return to the editor to add layers to the timeline.</p>
        </div>}
      </aside>
    </div>
  </section>;
}
