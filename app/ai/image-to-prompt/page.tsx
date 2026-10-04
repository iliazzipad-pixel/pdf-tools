'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type PromptStyle = 'detailed' | 'short' | 'tags';
type VisualContext = {
  width: number;
  height: number;
  palette: string[];
  lighting: string;
  contrast: string;
  saturation: string;
  visualFocus: string;
};
type SelectedImage = { file: File; previewUrl: string; width: number; height: number };

const STYLES: { id: PromptStyle; title: string; description: string }[] = [
  { id: 'detailed', title: 'Détaillé (Midjourney / Flux)', description: 'Sujet, composition, lumière et direction artistique' },
  { id: 'short', title: 'Court & descriptif', description: 'Une description concise, facile à réutiliser' },
  { id: 'tags', title: 'Mots-clés / Tags artistiques', description: 'Une liste de mots-clés séparés par des virgules' },
];

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function SparkleIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}><path d="m12 2.75 2.25 6.5 6.5 2.25-6.5 2.25-2.25 6.5-2.25-6.5-6.5-2.25 6.5-2.25 2.25-6.5Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round"/><path d="m19 14.5.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6ZM5 2l.65 1.85L7.5 4.5l-1.85.65L5 7l-.65-1.85L2.5 4.5l1.85-.65L5 2Z" fill="currentColor"/></svg>;
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} Ko` : `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function toHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

async function inspectImage(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  const sourceImage = new window.Image();
  sourceImage.src = sourceUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      sourceImage.onload = () => resolve();
      sourceImage.onerror = () => reject(new Error('Impossible de décoder l’image importée.'));
    });
    const scale = Math.min(1, 1024 / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
    const width = Math.max(1, Math.round(sourceImage.naturalWidth * scale));
    const height = Math.max(1, Math.round(sourceImage.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas indisponible pour analyser l’image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(sourceImage, 0, 0, width, height);

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 48;
    sampleCanvas.height = 48;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) throw new Error('Canvas indisponible pour analyser la palette.');
    sampleContext.drawImage(canvas, 0, 0, 48, 48);
    const pixels = sampleContext.getImageData(0, 0, 48, 48).data;
    const colorCounts = new Map<string, { count: number; red: number; green: number; blue: number }>();
    const tileEnergy = Array.from({ length: 9 }, () => 0);
    const tileCounts = Array.from({ length: 9 }, () => 0);
    let luminanceTotal = 0;
    let luminanceSquaredTotal = 0;
    let saturationTotal = 0;
    const luminances: number[] = [];

    for (let pixel = 0; pixel < pixels.length; pixel += 4) {
      const red = pixels[pixel];
      const green = pixels[pixel + 1];
      const blue = pixels[pixel + 2];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;
      luminances.push(luminance);
      luminanceTotal += luminance;
      luminanceSquaredTotal += luminance * luminance;
      saturationTotal += saturation;
      const key = [red, green, blue].map((channel) => Math.min(3, Math.floor(channel / 64))).join('-');
      const current = colorCounts.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
      current.count += 1;
      current.red += red;
      current.green += green;
      current.blue += blue;
      colorCounts.set(key, current);
    }

    const pixelCount = luminances.length;
    const averageLuminance = luminanceTotal / pixelCount;
    for (let index = 0; index < pixelCount; index += 1) {
      const x = index % 48;
      const y = Math.floor(index / 48);
      const tile = Math.floor(y / 16) * 3 + Math.floor(x / 16);
      tileEnergy[tile] += Math.abs(luminances[index] - averageLuminance);
      tileCounts[tile] += 1;
    }
    const meanSquare = luminanceSquaredTotal / pixelCount;
    const deviation = Math.sqrt(Math.max(0, meanSquare - averageLuminance ** 2));
    const averageSaturation = saturationTotal / pixelCount;
    const focusIndex = tileEnergy.reduce((best, value, index) => value / tileCounts[index] > tileEnergy[best] / tileCounts[best] ? index : best, 0);
    const focusLabels = ['upper-left', 'upper-center', 'upper-right', 'center-left', 'center', 'center-right', 'lower-left', 'lower-center', 'lower-right'];
    const dominantColors = [...colorCounts.values()]
      .sort((first, second) => second.count - first.count)
      .slice(0, 4)
      .map((color) => toHex(color.red / color.count, color.green / color.count, color.blue / color.count));

    return {
      imageData: canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.84),
      visualContext: {
        width: sourceImage.naturalWidth,
        height: sourceImage.naturalHeight,
        palette: dominantColors,
        lighting: averageLuminance < 78 ? 'low-key' : averageLuminance > 184 ? 'bright, airy' : 'balanced',
        contrast: deviation < 42 ? 'soft' : deviation > 82 ? 'high' : 'moderate',
        saturation: averageSaturation < 0.18 ? 'muted' : averageSaturation > 0.43 ? 'vivid' : 'natural',
        visualFocus: `the strongest tonal variation is around the ${focusLabels[focusIndex]} area`,
      } satisfies VisualContext,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function ImageToPromptPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [image, setImage] = useState<SelectedImage | null>(null);
  const [style, setStyle] = useState<PromptStyle>('detailed');
  const [isDragging, setIsDragging] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ prompt: string; source: 'vision' | 'fallback' } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
  }, []);

  function selectImage(file?: File) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Choisissez une image au format JPG, PNG ou WebP.');
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setImage({ file, previewUrl, width: 0, height: 0 });
    setResult(null);
    setError('');
    setCopied(false);
  }

  async function generatePrompt() {
    if (!image || isGenerating) return;
    setIsGenerating(true);
    setError('');
    setResult(null);
    try {
      const { imageData, visualContext } = await inspectImage(image.file);
      const response = await fetch('/api/describe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData, style, visualContext }),
      });
      const payload = await response.json() as { prompt?: string; source?: 'vision' | 'fallback'; error?: string };
      if (!response.ok || !payload.prompt) throw new Error(payload.error || 'Impossible de générer le prompt.');
      setResult({ prompt: payload.prompt, source: payload.source === 'vision' ? 'vision' : 'fallback' });
    } catch (generationError) {
      console.error('Image to Prompt failed:', generationError);
      setError(generationError instanceof Error ? generationError.message : 'Une erreur est survenue pendant l’analyse.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyPrompt() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Impossible d’accéder au presse-papiers depuis ce contexte.');
    }
  }

  function testWithFlux() {
    if (!result) return;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(result.prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1_000_000)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <main className="min-h-screen bg-[#101412] text-[#f3f5f0]">
      <header className="border-b border-white/[0.08] bg-[#141916]">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#728c57]/35 bg-[#28392a] text-[#bbec85]"><SparkleIcon /></span>
            <span className="text-[18px] font-semibold tracking-[-0.02em]">Pixel<span className="text-[#bbec85]">Press</span></span>
          </Link>
          <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#101413] p-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Accueil</Link>
            <Link href="/pdf" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Boîte à outils PDF</Link>
            <Link href="/image/compress" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Compresseur</Link>
          </nav>
          <span className="hidden text-xs text-[#89968e] md:block">Analyse d’image · IA</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-14 pt-9 sm:px-8 sm:pt-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#7955a5]/40 bg-[#39264c]/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#dfbafa]"><SparkleIcon className="h-4 w-4" />Image to Prompt</span>
            <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[40px]">L’image raconte. Retrouvez ses mots.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#a4afa7]">Importez une image pour en extraire un prompt riche, fidèle à sa composition et à sa direction artistique.</p>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[10px] border border-white/10 bg-[#191f1b] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.16)] sm:p-6" aria-labelledby="source-heading">
            <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Image source</p><h2 id="source-heading" className="mt-1 text-lg font-semibold">Choisir une image</h2></div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { selectImage(event.target.files?.[0]); event.target.value = ''; }} />
            <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectImage(event.dataTransfer.files[0]); }} className={`flex min-h-[150px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors ${isDragging ? 'border-[#b590d3] bg-[#30243b]' : 'border-[#46534b] bg-[#151a18] hover:border-[#806b91] hover:bg-[#1c201e]'}`}>
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-[#30243b] text-[#d7b8ef]"><SparkleIcon /></span>
              <span className="text-sm font-semibold">Déposez une image ici</span><span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour parcourir vos fichiers</span><span className="mt-3 text-[10px] text-[#717d75]">JPG · PNG · WebP</span>
            </button>

            {image && <div className="mt-4 overflow-hidden rounded-lg border border-white/[0.08] bg-[#151a18]">
              <div className="relative flex min-h-[170px] max-h-[300px] items-center justify-center bg-[#111613] p-3">
                {/* Local image preview; its load event supplies the original dimensions. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.previewUrl} alt={`Image importée ${image.file.name}`} onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  setImage((current) => current?.file === image.file ? { ...current, width: naturalWidth, height: naturalHeight } : current);
                }} className="max-h-[276px] max-w-full rounded object-contain" />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-3.5 py-3">
                <div className="min-w-0"><p className="truncate text-xs font-medium text-[#e4e9e4]" title={image.file.name}>{image.file.name}</p><p className="mt-1 text-[11px] text-[#87948c]">{image.width && image.height ? `${image.width} × ${image.height} px · ` : ''}{formatSize(image.file.size)}</p></div>
                <button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 rounded-md border border-white/10 px-2.5 py-2 text-[11px] font-medium text-[#bac4be] hover:bg-white/[0.06]">Remplacer</button>
              </div>
            </div>}

            <fieldset className="mt-6">
              <legend className="mb-2.5 text-xs font-medium text-[#a8b2ab]">Style du prompt</legend>
              <div className="grid gap-2">
                {STYLES.map((option) => <button key={option.id} type="button" role="radio" aria-checked={style === option.id} onClick={() => setStyle(option.id)} className={`flex min-h-[64px] items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left transition ${style === option.id ? 'border-[#9b76bd]/70 bg-[#30243b]' : 'border-white/10 bg-[#141a16] hover:border-white/20'}`}><span><span className="block text-xs font-semibold text-[#e5e8e5]">{option.title}</span><span className="mt-1 block text-[10px] leading-4 text-[#89958d]">{option.description}</span></span><span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${style === option.id ? 'border-[#d4b0ec] bg-[#d4b0ec]' : 'border-[#69736c]'}`}>{style === option.id && <span className="h-1.5 w-1.5 rounded-full bg-[#25192e]" />}</span></button>)}
              </div>
            </fieldset>

            {error && <p role="alert" className="mt-4 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs leading-5 text-[#f3a294]">{error}</p>}
            <button type="button" onClick={generatePrompt} disabled={!image || isGenerating} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#c99be9] px-4 text-sm font-semibold text-[#22152d] transition hover:bg-[#ddb9f3] disabled:cursor-not-allowed disabled:bg-[#544a59] disabled:text-[#a9a0ad]">{isGenerating ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#74617f] border-t-[#25182e]" />Analyse en cours…</> : <><SparkleIcon className="h-4 w-4" />Générer le prompt</>}</button>
            <p className="mt-3 text-center text-[10px] leading-4 text-[#77837a]">L’image est réduite avant analyse. Si aucun modèle vision n’est configuré, l’outil utilise ses caractéristiques visuelles.</p>
          </section>

          <section className="overflow-hidden rounded-[10px] border border-white/10 bg-[#191f1b] shadow-[0_12px_36px_rgba(0,0,0,0.16)]" aria-labelledby="result-heading">
            <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-white/[0.08] px-4 sm:px-5"><div><h2 id="result-heading" className="text-sm font-semibold text-[#e6ebe6]">Prompt extrait</h2><p className="mt-0.5 text-[10px] text-[#7e8a82]">{result?.source === 'vision' ? 'Analyse multimodale' : result?.source === 'fallback' ? 'Analyse visuelle locale' : 'Votre résultat apparaîtra ici'}</p></div>{result && <span className="rounded-full border border-[#7955a5]/35 bg-[#30243b] px-2.5 py-1 text-[10px] font-medium text-[#d7b8ef]">{style === 'detailed' ? 'Détaillé' : style === 'short' ? 'Descriptif' : 'Tags'}</span>}</div>
            <div className="min-h-[340px] bg-[#111613] p-4 sm:min-h-[430px] sm:p-5">
              {isGenerating ? <div className="flex min-h-[300px] flex-col justify-between rounded-lg border border-white/[0.07] bg-[#171d19] p-5"><div className="space-y-3"><div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.08]"/><div className="h-3 w-full animate-pulse rounded bg-white/[0.06]"/><div className="h-3 w-5/6 animate-pulse rounded bg-white/[0.06]"/><div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]"/></div><p className="text-xs text-[#bda0d0]">Lecture de la composition, de la lumière et du style…</p></div> : result ? <div className="flex min-h-[300px] flex-col"><p className="flex-1 whitespace-pre-wrap rounded-lg border border-white/[0.07] bg-[#171d19] p-4 text-sm leading-7 text-[#e0e6df]">{result.prompt}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={copyPrompt} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#d9f28b] px-3.5 text-xs font-semibold text-[#20291d] transition hover:bg-[#e6f8aa]">{copied ? '✓ Copié !' : <><span aria-hidden="true">▢</span>Copier le prompt</>}</button><button type="button" onClick={testWithFlux} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#7955a5]/40 bg-[#30243b] px-3.5 text-xs font-semibold text-[#e4d0f4] transition hover:bg-[#3c2b4c]"><SparkleIcon className="h-4 w-4"/>Tester avec Flux / Midjourney</button></div></div> : <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-white/10 px-5 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-[#7955a5]/25 bg-[#30243b]/60 text-[#cda8e9]"><SparkleIcon /></span><p className="mt-4 text-sm font-medium text-[#d5ddd6]">Votre prompt apparaîtra ici</p><p className="mt-1.5 max-w-xs text-xs leading-5 text-[#7e8a82]">Ajoutez une image pour obtenir une description prête à utiliser.</p></div></div>}
            </div>
          </section>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5 text-xs text-[#75827a]"><span>JPG · PNG · WebP</span><nav aria-label="Liens rapides" className="flex gap-4"><Link href="/" className="hover:text-white">Tous les outils</Link><Link href="/pdf" className="hover:text-white">PDF</Link><Link href="/image/compress" className="hover:text-white">Compresseur</Link></nav></footer>
      </section>
    </main>
  );
}
