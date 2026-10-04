'use client';

import Cropper, { type Area } from 'react-easy-crop';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type CropRatio = 'free' | 'square' | 'landscape' | 'story' | 'portrait';
type OutputFormat = 'original' | 'image/jpeg' | 'image/png' | 'image/webp';
type CropResult = { url: string; blob: Blob; width: number; height: number };

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ASPECT_RATIOS: { id: CropRatio; label: string; description: string; value?: number }[] = [
  { id: 'free', label: 'Libre', description: 'Ratio natif de l’image' },
  { id: 'square', label: '1:1', description: 'Carré Instagram', value: 1 },
  { id: 'landscape', label: '16:9', description: 'Bannière / Paysage', value: 16 / 9 },
  { id: 'story', label: '9:16', description: 'Story / TikTok', value: 9 / 16 },
  { id: 'portrait', label: '4:5', description: 'Portrait', value: 4 / 5 },
];

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function FileIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.75H6.75A1.75 1.75 0 0 0 5 5.5v13A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V9.25L13.5 3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M13 4v5.5h5.5M8 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function DownloadIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function outputType(format: OutputFormat, sourceType: string) {
  return format === 'original' ? sourceType : format;
}

function extensionFor(type: string) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

function outputFilename(sourceName: string, mimeType: string) {
  const baseName = sourceName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'image';
  return `${baseName}-recadree.${extensionFor(mimeType)}`;
}

async function createCroppedBlob(imageUrl: string, crop: Area, mimeType: string) {
  const image = new window.Image();
  const imageReady = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Impossible de décoder cette image.'));
  });
  image.src = imageUrl;
  await imageReady;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width));
  canvas.height = Math.max(1, Math.round(crop.height));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponible pour recadrer l’image.');
  if (mimeType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => output ? resolve(output) : reject(new Error('Le navigateur n’a pas pu exporter le recadrage.')), mimeType, mimeType === 'image/jpeg' || mimeType === 'image/webp' ? 0.92 : undefined);
  });
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

export default function ResizeImagePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspectChoice, setAspectChoice] = useState<CropRatio>('free');
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [format, setFormat] = useState<OutputFormat>('original');
  const [result, setResult] = useState<CropResult | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResult(null);
  }

  function selectFile(selectedFile?: File) {
    if (!selectedFile) return;
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      setError('Choisissez une image au format JPG, PNG ou WebP.');
      return;
    }
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    const nextUrl = URL.createObjectURL(selectedFile);
    sourceUrlRef.current = nextUrl;
    setFile(selectedFile);
    setSourceUrl(nextUrl);
    setSourceDimensions(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setError('');
    clearResult();
  }

  function handleCropComplete(_croppedArea: Area, croppedPixels: Area) {
    setCroppedAreaPixels(croppedPixels);
  }

  function selectAspect(choice: CropRatio) {
    setAspectChoice(choice);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    clearResult();
  }

  async function cropImage() {
    if (!file || !sourceDimensions || !croppedAreaPixels || isCropping) return;
    setIsCropping(true);
    setError('');
    clearResult();
    try {
      const mimeType = outputType(format, file.type);
      const blob = await createCroppedBlob(sourceUrl, croppedAreaPixels, mimeType);
      const url = URL.createObjectURL(blob);
      resultUrlRef.current = url;
      setResult({
        url,
        blob,
        width: Math.round(croppedAreaPixels.width),
        height: Math.round(croppedAreaPixels.height),
      });
    } catch (cropError) {
      console.error('Image crop failed:', cropError);
      setError(cropError instanceof Error ? cropError.message : 'Le recadrage a échoué.');
    } finally {
      setIsCropping(false);
    }
  }

  function downloadResult() {
    if (!result || !file) return;
    const link = document.createElement('a');
    link.href = result.url;
    link.download = outputFilename(file.name, result.blob.type);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const selectedAspect = ASPECT_RATIOS.find((item) => item.id === aspectChoice);
  const cropAspect = aspectChoice === 'free' && sourceDimensions
    ? sourceDimensions.width / sourceDimensions.height
    : selectedAspect?.value ?? 1;

  return (
    <main className="min-h-screen bg-[#101412] text-[#f3f5f0]">
      <header className="border-b border-white/[0.08] bg-[#141916]">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil"><span className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#728c57]/35 bg-[#28392a] text-[#bbec85]"><FileIcon /></span><span className="text-[18px] font-semibold tracking-[-0.02em]">Pixel<span className="text-[#bbec85]">Press</span></span></Link>
          <nav aria-label="Navigation principale" className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#101413] p-1 text-sm"><Link href="/" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Accueil</Link><Link href="/pdf" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">PDF</Link><Link href="/image/compress" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Compresseur</Link></nav>
          <span className="hidden text-xs text-[#89968e] md:block">Recadrage local · 100 % privé</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-14 pt-9 sm:px-8 sm:pt-12">
        <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#89cfc6]">Outil image</p><h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[40px]">Recadrer une image</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#a4afa7]">Déplacez l’image, choisissez le cadre et ajustez le zoom pour obtenir exactement le cadrage souhaité.</p></div>

        <div className="grid items-start gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[10px] border border-white/10 bg-[#191f1b] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.16)] sm:p-6" aria-labelledby="source-heading">
            <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Image source</p><h2 id="source-heading" className="mt-1 text-lg font-semibold">Choisir une image</h2></div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { selectFile(event.target.files?.[0]); event.target.value = ''; }} />
            {!file ? <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFile(event.dataTransfer.files[0]); }} className={`flex min-h-[180px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors ${isDragging ? 'border-[#89cfc6] bg-[#203734]' : 'border-[#46534b] bg-[#151a18] hover:border-[#6c9c96] hover:bg-[#1c201e]'}`}><span className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-[#203734] text-[#89cfc6]"><FileIcon /></span><span className="text-sm font-semibold">Déposez une image ici</span><span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour sélectionner un fichier</span><span className="mt-3 text-[10px] text-[#717d75]">JPG · PNG · WebP</span></button> : <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#151a18]"><div className="relative flex min-h-[150px] max-h-[240px] items-center justify-center bg-[#111613] p-2"><Image src={sourceUrl} alt={`Image source ${file.name}`} fill unoptimized className="object-contain p-2" sizes="(max-width: 1024px) 100vw, 40vw" onLoad={(event) => { const imageElement = event.currentTarget; setSourceDimensions({ width: imageElement.naturalWidth, height: imageElement.naturalHeight }); }} /></div><div className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-3.5 py-3"><div className="min-w-0"><p className="truncate text-xs font-medium" title={file.name}>{file.name}</p><p className="mt-1 text-[11px] text-[#87948c]">{sourceDimensions ? `${sourceDimensions.width} × ${sourceDimensions.height} px · ` : ''}{formatSize(file.size)}</p></div><button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 rounded-md border border-white/10 px-2.5 py-2 text-[11px] font-medium text-[#bac4be] hover:bg-white/[0.06]">Remplacer</button></div></div>}

            {file && sourceDimensions && <>
              <fieldset className="mt-5"><legend className="mb-2.5 text-xs font-medium text-[#a8b2ab]">Format du cadre</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{ASPECT_RATIOS.map((item) => <button key={item.id} type="button" aria-pressed={aspectChoice === item.id} onClick={() => selectAspect(item.id)} className={`min-h-[56px] rounded-md border px-3 py-2 text-left transition ${aspectChoice === item.id ? 'border-[#70aaa3] bg-[#203734] text-white' : 'border-white/10 bg-[#141a16] text-[#a3ada6] hover:border-white/20'}`}><span className="block text-xs font-semibold">{item.label}</span><span className="mt-1 block text-[9px] leading-3 text-[#849188]">{item.description}</span></button>)}</div></fieldset>

              <div className="mt-5 rounded-md border border-white/[0.08] bg-[#141a16] px-3.5 py-3"><div className="mb-2 flex items-center justify-between"><label htmlFor="crop-zoom" className="text-xs font-medium text-[#a8b2ab]">Zoom</label><output htmlFor="crop-zoom" className="text-xs tabular-nums text-[#89cfc6]">{zoom.toFixed(1)}×</output></div><input id="crop-zoom" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => { setZoom(Number(event.target.value)); clearResult(); }} className="w-full accent-[#89cfc6]"/><div className="mt-1 flex justify-between text-[9px] text-[#718077]"><span>1×</span><span>3×</span></div></div>

              <label className="mt-5 block text-xs font-medium text-[#a8b2ab]">Format de sortie<select value={format} onChange={(event) => { setFormat(event.target.value as OutputFormat); clearResult(); }} className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#111613] px-3 text-xs text-white outline-none focus:border-[#70aaa3]"><option value="original">Format d’origine ({file.type.split('/')[1].toUpperCase()})</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
            </>}

            {error && <p role="alert" className="mt-4 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs leading-5 text-[#f3a294]">{error}</p>}
            <button type="button" onClick={cropImage} disabled={!file || !croppedAreaPixels || isCropping} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#89cfc6] px-4 text-sm font-semibold text-[#14221f] transition hover:bg-[#a7ded6] disabled:cursor-not-allowed disabled:bg-[#46544f] disabled:text-[#a4b1ac]">{isCropping ? 'Recadrage…' : 'Recadrer et télécharger'}{!isCropping && <span aria-hidden="true">→</span>}</button>
            <p className="mt-3 text-center text-[10px] text-[#77837a]">Déplacement et export traités dans votre navigateur</p>
          </section>

          <section className="overflow-hidden rounded-[10px] border border-white/10 bg-[#191f1b] shadow-[0_12px_36px_rgba(0,0,0,0.16)]" aria-labelledby="crop-heading">
            <div className="flex min-h-[58px] items-center justify-between border-b border-white/[0.08] px-4 sm:px-5"><div><h2 id="crop-heading" className="text-sm font-semibold text-[#e6ebe6]">Zone de recadrage</h2><p className="mt-0.5 text-[10px] text-[#7e8a82]">Glissez l’image et ajustez le cadre</p></div>{sourceDimensions && <span className="text-[10px] tabular-nums text-[#89cfc6]">{sourceDimensions.width} × {sourceDimensions.height} px</span>}</div>
            <div className="relative h-[min(65vh,560px)] min-h-[320px] overflow-hidden bg-[#111613]">
              {sourceUrl ? <Cropper image={sourceUrl} crop={crop} zoom={zoom} minZoom={1} maxZoom={3} aspect={cropAspect} objectFit="contain" restrictPosition showGrid onCropChange={(nextCrop) => { setCrop(nextCrop); clearResult(); }} onZoomChange={(nextZoom) => { setZoom(nextZoom); clearResult(); }} onCropComplete={handleCropComplete} onMediaLoaded={(media) => setSourceDimensions({ width: media.naturalWidth, height: media.naturalHeight })} /> : <div className="absolute inset-0 grid place-items-center px-5 text-center text-xs text-[#69766e]">Importez une image pour commencer le recadrage.</div>}
            </div>
            {result && <div className="border-t border-white/[0.08] bg-[#171d19] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[#e5ebe5]">Recadrage prêt</p><p className="mt-1 text-[11px] text-[#98a59c]">{result.width} × {result.height} px · {formatSize(result.blob.size)}</p></div><button type="button" onClick={downloadResult} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#89cfc6] px-3.5 text-xs font-semibold text-[#14221f] transition hover:bg-[#a7ded6]"><DownloadIcon />Télécharger l’image</button></div><div className="relative mt-4 max-h-[240px] overflow-hidden rounded-md bg-[#111613]" style={{ aspectRatio: `${result.width} / ${result.height}` }}><Image src={result.url} alt="Aperçu du recadrage" fill unoptimized className="object-contain" sizes="(max-width: 1024px) 100vw, 55vw" /></div></div>}
          </section>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-5 text-xs text-[#75827a]"><span>JPG · PNG · WebP</span><nav aria-label="Liens rapides" className="flex gap-4"><Link href="/" className="hover:text-white">Tous les outils</Link><Link href="/pdf" className="hover:text-white">PDF</Link><Link href="/image/compress" className="hover:text-white">Compresseur</Link></nav></footer>
      </section>
    </main>
  );
}
