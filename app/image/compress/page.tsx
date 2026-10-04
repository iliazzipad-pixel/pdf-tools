'use client';

import imageCompression from 'browser-image-compression';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const COMPRESSION_PRESETS = [
  { id: 'extreme', title: 'COMPRESSION EXTRÊME', description: 'Moins de qualité, haute compression', maxSizeMB: 0.5, quality: 0.3 },
  { id: 'recommended', title: 'COMPRESSION RECOMMANDÉE', description: 'Bonne qualité, bonne compression', maxSizeMB: 1, quality: 0.7 },
  { id: 'light', title: 'BASSE COMPRESSION', description: 'Haute qualité, moins de compression', maxSizeMB: 2, quality: 0.9 },
] as const;

type CompressionResult = {
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
};

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function FileGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
      <path d="M13.5 3.75H6.75A1.75 1.75 0 0 0 5 5.5v13A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V9.25L13.5 3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 4v5.5h5.5M8.5 15.5l2.25-2.25 2 2 1.5-1.5 2.25 2.25M9 10.5h1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ImageCompressorPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const originalUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState('');
  const [result, setResult] = useState<CompressionResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<(typeof COMPRESSION_PRESETS)[number]['id']>('recommended');
  const selectedPreset = COMPRESSION_PRESETS.find((preset) => preset.id === selectedPresetId) ?? COMPRESSION_PRESETS[1];

  useEffect(() => () => {
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  function selectFile(selectedFile?: File) {
    if (!selectedFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedFile.type)) {
      setError('Choisissez une image au format JPG, PNG ou WebP.');
      return;
    }
    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current);
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    const nextUrl = URL.createObjectURL(selectedFile);
    originalUrlRef.current = nextUrl;
    resultUrlRef.current = null;
    setFile(selectedFile);
    setOriginalUrl(nextUrl);
    setResult(null);
    setProgress(0);
    setError('');
  }

  async function compressImage() {
    if (!file || file.size > MAX_FILE_SIZE || isCompressing) return;
    setIsCompressing(true);
    setProgress(0);
    setError('');
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: selectedPreset.maxSizeMB,
        initialQuality: selectedPreset.quality,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        onProgress: (value) => setProgress(Math.round(value)),
      });
      const previewUrl = URL.createObjectURL(compressed);
      resultUrlRef.current = previewUrl;
      setResult({ file: compressed, previewUrl, originalSize: file.size, compressedSize: compressed.size });
      setProgress(100);
    } catch {
      setError('La compression a échoué. Réessayez avec une autre image.');
    } finally {
      setIsCompressing(false);
    }
  }

  const savedPercent = result
    ? Math.max(0, Math.round((1 - result.compressedSize / result.originalSize) * 100))
    : 0;

  return (
    <main className="min-h-screen bg-[#f4f6f3] text-[#172521]">
      <header className="border-b border-[#e3e9e3] bg-white/90">
        <div className="mx-auto flex min-h-[72px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#153b32] text-[#d7f36a]"><FileGlyph /></span>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">PixelPress</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 rounded-lg border border-[#e3e9e3] bg-[#f7f9f6] p-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 text-[#58675f] transition hover:bg-white">Tous les outils</Link>
            <Link href="/pdf" className="rounded-md px-3 py-2 text-[#58675f] transition hover:bg-white">Outils PDF</Link>
          </nav>
          <span className="rounded-full border border-[#dfe6de] px-3 py-1.5 text-xs font-medium text-[#52635c]">Gratuit · Jusqu’à 25 Mo</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-9 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#5d796a]">Optimiseur d’images</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Des images plus légères.<br className="hidden sm:block" /> La même belle qualité.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#64736c]">Compressez vos fichiers en quelques secondes. Vos images ne quittent jamais votre appareil.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[10px] border border-[#e0e7df] bg-white p-5 shadow-[0_8px_30px_rgba(27,51,41,0.035)] sm:p-6" aria-labelledby="source-heading">
            <div className="mb-5 flex items-center justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#819087]">Étape 01</p><h2 id="source-heading" className="mt-1 text-lg font-semibold tracking-[-0.02em]">Choisir une image</h2></div>
              <span className="rounded-md bg-[#f0f4ed] px-2.5 py-1.5 text-xs font-medium text-[#526b5d]">JPG · PNG · WebP</span>
            </div>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} />
            {!file ? (
              <button type="button" className={`flex min-h-[270px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-5 text-center transition-colors ${isDragging ? 'border-[#477965] bg-[#eff6ed]' : 'border-[#cbd7cd] bg-[#fafbf9] hover:border-[#86a48f] hover:bg-[#f6f9f4]'}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFile(event.dataTransfer.files[0]); }}>
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#eaf1e8] text-[#47715a]"><FileGlyph /></span>
                <span className="text-[15px] font-semibold">Glissez votre image ici</span><span className="mt-1.5 text-sm text-[#76847c]">ou cliquez pour parcourir vos fichiers</span><span className="mt-5 text-xs text-[#98a39d]">Taille maximale : 25 Mo</span>
              </button>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[#e5eae4] bg-[#fafbf9]">
                <div className="relative aspect-[16/9] bg-[#eef1ec]"><Image src={originalUrl} alt={`Aperçu de ${file.name}`} fill unoptimized className="object-contain p-3" sizes="(max-width: 1024px) 100vw, 45vw" /></div>
                <div className="flex items-center gap-3 px-4 py-3.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eaf1e8] text-[#47715a]"><FileGlyph /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={file.name}>{file.name}</p><p className="mt-0.5 text-xs text-[#7b8981]">{formatSize(file.size)}</p></div><button type="button" onClick={() => inputRef.current?.click()} className="rounded-md border border-[#dfe6de] bg-white px-3 py-2 text-xs font-medium text-[#52635c] transition hover:bg-[#f1f5ef]">Remplacer</button></div>
              </div>
            )}
            {file && file.size > MAX_FILE_SIZE && <p role="alert" className="mt-4 rounded-md border border-[#f1d6a4] bg-[#fff8e9] px-3.5 py-3 text-sm leading-5 text-[#80591c]">Fichier supérieur à 25 Mo — Disponible prochainement avec l&apos;offre Pro</p>}
            {error && <p role="alert" className="mt-4 rounded-md border border-[#efcfca] bg-[#fff5f2] px-3.5 py-3 text-sm text-[#963f34]">{error}</p>}
            <div className="mt-5 rounded-lg border border-[#292b2d] bg-[#17191a] p-4 text-white sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#f08070]">Réglages de compression</h3><span className="text-[11px] text-[#92989a]">Choisissez un niveau</span></div>
              <div className="grid gap-2.5">
                {COMPRESSION_PRESETS.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={isCompressing}
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`flex min-h-[72px] w-full items-center justify-between gap-3 rounded-md border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed ${isSelected ? 'border-[#8eb469] bg-[#222824]' : 'border-[#343739] bg-[#1d1f20] hover:border-[#68605d]'}`}
                    >
                      <span className="min-w-0">
                        <span className={`block text-[11px] font-bold tracking-[0.07em] ${isSelected ? 'text-[#f08070]' : 'text-[#e5e7e6]'}`}>{preset.title}</span>
                        <span className="mt-1 block text-xs text-[#a7aeab]">{preset.description}</span>
                        <span className="mt-1 block text-[10px] text-[#777f7b]">Cible {preset.maxSizeMB} Mo · Qualité {Math.round(preset.quality * 100)}%</span>
                      </span>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${isSelected ? 'border-[#84ad61] bg-[#84ad61] text-[#142015]' : 'border-[#616867] text-transparent'}`} aria-hidden="true">
                        {isSelected && <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5"><path d="m3.5 8.2 2.8 2.7 6.2-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <button type="button" onClick={compressImage} disabled={!file || file.size > MAX_FILE_SIZE || isCompressing} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#183d33] px-4 text-sm font-semibold text-white transition hover:bg-[#245344] disabled:cursor-not-allowed disabled:bg-[#b8c4bc]">{isCompressing ? `Compression en cours… ${progress}%` : 'Compresser l’image'}{!isCompressing && <span aria-hidden="true">→</span>}</button>
            {isCompressing && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8ede7]" role="progressbar" aria-label="Progression de la compression" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-[#8caf59] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>}
            <p className="mt-4 text-center text-xs text-[#8b9790]">Traitement local · Vos fichiers restent sur votre appareil</p>
          </section>

          <section className="rounded-[10px] border border-[#e0e7df] bg-white p-5 shadow-[0_8px_30px_rgba(27,51,41,0.035)] sm:p-6" aria-labelledby="result-heading">
            <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#819087]">Étape 02</p><h2 id="result-heading" className="mt-1 text-lg font-semibold tracking-[-0.02em]">Votre résultat</h2></div>{result && <span className="rounded-full bg-[#edf5e8] px-2.5 py-1 text-xs font-semibold text-[#4d7137]">-{savedPercent}%</span>}</div>
            {result ? <>
              <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-[#eef1ec]"><Image src={result.previewUrl} alt={`Image compressée, ${formatSize(result.compressedSize)}`} fill unoptimized className="object-contain p-3" sizes="(max-width: 1024px) 100vw, 50vw" /><span className="absolute left-3 top-3 rounded bg-white/90 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#53635a] shadow-sm">Compressée</span></div>
              <div className="mt-5 grid grid-cols-3 divide-x divide-[#e7ece6] rounded-lg border border-[#e7ece6] py-3.5"><div className="px-3 text-center"><p className="text-[11px] font-medium text-[#829087]">Avant</p><p className="mt-1 text-sm font-semibold">{formatSize(result.originalSize)}</p></div><div className="px-3 text-center"><p className="text-[11px] font-medium text-[#829087]">Après</p><p className="mt-1 text-sm font-semibold text-[#285b43]">{formatSize(result.compressedSize)}</p></div><div className="px-3 text-center"><p className="text-[11px] font-medium text-[#829087]">Économisé</p><p className="mt-1 text-sm font-semibold text-[#658848]">{savedPercent}%</p></div></div>
              <a href={result.previewUrl} download={`compressed-${file?.name ?? 'image'}`} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-md border border-[#c9d8c7] bg-[#f2f7ef] text-sm font-semibold text-[#31583e] transition hover:bg-[#e9f2e4]"><DownloadGlyph />Télécharger l’image</a>
            </> : <div className="flex min-h-[390px] flex-col items-center justify-center rounded-lg border border-dashed border-[#dce4dc] bg-[#fafbf9] px-6 text-center"><span className="grid h-12 w-12 place-items-center rounded-xl bg-[#f0f3ef] text-[#98a69c]"><FileGlyph /></span><p className="mt-4 text-sm font-medium text-[#627168]">Votre image compressée apparaîtra ici</p><p className="mt-1.5 max-w-xs text-xs leading-5 text-[#929e96]">Choisissez une image puis lancez la compression pour comparer les résultats.</p></div>}
          </section>
        </div>
        <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 text-xs text-[#89968e]"><span>JPG, PNG et WebP pris en charge</span><span>Vos fichiers ne sont jamais envoyés sur un serveur</span><Link href="/" className="font-medium text-[#526b5d] hover:text-[#183d33]">Tous les outils PixelPress</Link></footer>
      </section>
    </main>
  );
}
