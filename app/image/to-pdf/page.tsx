'use client';

import { PDFDocument } from 'pdf-lib';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type SourceImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type PageFormat = 'image' | 'a4';
type Orientation = 'portrait' | 'landscape';
type Margin = 'none' | 'small' | 'large';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const A4_SIZE = { width: 595.28, height: 841.89 };
const MARGIN_SIZE: Record<Margin, number> = { none: 0, small: 24, large: 48 };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M13.5 3.75H6.75A1.75 1.75 0 0 0 5 5.5v13A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V9.25L13.5 3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 4v5.5h5.5M8 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function isAcceptedImage(file: File) {
  return ACCEPTED_TYPES.includes(file.type);
}

async function webpToPngDataUrl(file: File) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = imageUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Impossible de décoder ${file.name}.`));
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponible pour convertir le WebP.');
    context.drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export default function ImageToPdfPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageUrlsRef = useRef<string[]>([]);
  const resultUrlRef = useRef<string | null>(null);
  const [images, setImages] = useState<SourceImage[]>([]);
  const [pageFormat, setPageFormat] = useState<PageFormat>('image');
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [margin, setMargin] = useState<Margin>('none');
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ url: string; size: number } | null>(null);

  useEffect(() => () => {
    imageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  function addImages(selectedFiles: FileList | File[]) {
    const incoming = Array.from(selectedFiles);
    const accepted = incoming.filter(isAcceptedImage);
    if (accepted.length !== incoming.length) setError('Formats acceptés : JPG, PNG et WebP.');
    else setError('');
    if (accepted.length === 0) return;

    const additions = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    imageUrlsRef.current.push(...additions.map((image) => image.previewUrl));
    setImages((current) => [...current, ...additions]);
    clearResult();
  }

  function clearResult() {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResult(null);
    setProgress(0);
  }

  function moveImage(index: number, direction: -1 | 1) {
    setImages((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
    clearResult();
  }

  function removeImage(index: number) {
    const removed = images[index];
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
      imageUrlsRef.current = imageUrlsRef.current.filter((url) => url !== removed.previewUrl);
    }
    setImages((current) => {
      return current.filter((_, imageIndex) => imageIndex !== index);
    });
    clearResult();
  }

  async function convertToPdf() {
    if (images.length === 0 || isConverting) return;
    setIsConverting(true);
    setError('');
    setProgress(0);
    clearResult();

    try {
      const pdf = await PDFDocument.create();
      for (let index = 0; index < images.length; index += 1) {
        const { file } = images[index];
        const imageBytes = await file.arrayBuffer();
        const embeddedImage = file.type === 'image/jpeg'
          ? await pdf.embedJpg(imageBytes)
          : file.type === 'image/png'
            ? await pdf.embedPng(imageBytes)
            : await pdf.embedPng(await webpToPngDataUrl(file));

        const marginPoints = MARGIN_SIZE[margin];
        let pageWidth: number;
        let pageHeight: number;
        let imageX: number;
        let imageY: number;
        let drawWidth: number;
        let drawHeight: number;

        if (pageFormat === 'image') {
          pageWidth = embeddedImage.width + marginPoints * 2;
          pageHeight = embeddedImage.height + marginPoints * 2;
          imageX = marginPoints;
          imageY = marginPoints;
          drawWidth = embeddedImage.width;
          drawHeight = embeddedImage.height;
        } else {
          const [a4Width, a4Height] = orientation === 'portrait'
            ? [A4_SIZE.width, A4_SIZE.height]
            : [A4_SIZE.height, A4_SIZE.width];
          pageWidth = a4Width;
          pageHeight = a4Height;
          const availableWidth = pageWidth - marginPoints * 2;
          const availableHeight = pageHeight - marginPoints * 2;
          const scale = Math.min(availableWidth / embeddedImage.width, availableHeight / embeddedImage.height);
          drawWidth = embeddedImage.width * scale;
          drawHeight = embeddedImage.height * scale;
          imageX = (pageWidth - drawWidth) / 2;
          imageY = (pageHeight - drawHeight) / 2;
        }

        const page = pdf.addPage([pageWidth, pageHeight]);
        page.drawImage(embeddedImage, { x: imageX, y: imageY, width: drawWidth, height: drawHeight });
        setProgress(Math.round(((index + 1) / images.length) * 100));
      }

      const bytes = await pdf.save({ useObjectStreams: true });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      resultUrlRef.current = url;
      setResult({ url, size: bytes.byteLength });
      setProgress(100);
    } catch (conversionError) {
      console.error('Échec de conversion des images en PDF :', conversionError);
      setError('La conversion a échoué. Vérifiez que les images sélectionnées sont lisibles.');
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#111615] text-[#f4f6f3]">
      <header className="border-b border-white/10 bg-[#151b19]">
        <div className="mx-auto flex min-h-[72px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#153b32] text-[#d7f36a]"><FileIcon /></span>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">PixelPress</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#101413] p-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Accueil</Link>
            <Link href="/image/compress" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Compresser une image</Link>
            <Link href="/pdf" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Outils PDF</Link>
          </nav>
          <span className="hidden text-xs text-[#89968e] md:block">100 % local</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#a5c574]">Outil image vers PDF</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Vos images, réunies dans un PDF.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#a2ada7]">Ajoutez vos images, organisez-les et choisissez le format de page. La conversion reste sur votre appareil.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="images-heading">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 01</p><h2 id="images-heading" className="mt-1 text-lg font-semibold">Ajouter des images</h2></div>
              <span className="rounded-md border border-white/10 bg-[#141917] px-2.5 py-1.5 text-xs font-medium text-[#bac4be]">JPG · PNG · WebP</span>
            </div>

            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(event) => { if (event.target.files) addImages(event.target.files); event.target.value = ''; }} />
            <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); addImages(event.dataTransfer.files); }} className={`flex min-h-[142px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors ${isDragging ? 'border-[#96b86b] bg-[#273329]' : 'border-[#46534b] bg-[#151a18] hover:border-[#758b68] hover:bg-[#1c231f]'}`}>
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-[#26372a] text-[#b9e88c]"><FileIcon /></span>
              <span className="text-sm font-semibold">Déposez vos images ici</span>
              <span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour sélectionner plusieurs fichiers</span>
            </button>

            {error && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{error}</p>}

            {images.length > 0 ? (
              <ol className="mt-4 grid max-h-[490px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                {images.map((image, index) => (
                  <li key={image.id} className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#151a18]">
                    <div className="relative aspect-[4/3] bg-[#202623]"><Image src={image.previewUrl} alt={`Aperçu de ${image.file.name}`} fill unoptimized className="object-contain p-2" sizes="(max-width: 640px) 44vw, 220px" /></div>
                    <div className="p-2.5">
                      <p className="truncate text-xs font-medium text-[#e7ebe8]" title={image.file.name}>{image.file.name}</p>
                      <p className="mt-1 text-[11px] text-[#87948c]">{formatSize(image.file.size)}</p>
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <button type="button" onClick={() => moveImage(index, -1)} disabled={index === 0 || isConverting} aria-label={`Monter ${image.file.name}`} title="Monter" className="grid h-8 w-8 place-items-center rounded border border-white/10 text-[#b8c3bc] hover:bg-white/10 disabled:opacity-30">↑</button>
                        <span className="text-[10px] tabular-nums text-[#7e8c83]">{index + 1} / {images.length}</span>
                        <button type="button" onClick={() => moveImage(index, 1)} disabled={index === images.length - 1 || isConverting} aria-label={`Descendre ${image.file.name}`} title="Descendre" className="grid h-8 w-8 place-items-center rounded border border-white/10 text-[#b8c3bc] hover:bg-white/10 disabled:opacity-30">↓</button>
                        <button type="button" onClick={() => removeImage(index)} disabled={isConverting} aria-label={`Supprimer ${image.file.name}`} title="Supprimer" className="grid h-8 w-8 place-items-center rounded border border-[#573b38] text-[#ed9e90] hover:bg-[#6b302b]/30 disabled:opacity-30">×</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-4 flex min-h-[124px] items-center justify-center rounded-lg border border-white/[0.07] bg-[#151a18] px-5 text-center text-sm text-[#87948c]">Les images sélectionnées apparaîtront ici, dans l’ordre des pages.</div>
            )}
          </section>

          <section className="flex flex-col rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="options-heading">
            <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 02</p><h2 id="options-heading" className="mt-1 text-lg font-semibold">Options de page</h2></div>

            <fieldset>
              <legend className="mb-2.5 text-xs font-medium text-[#a8b2ab]">Format de page</legend>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" role="radio" aria-checked={pageFormat === 'image'} onClick={() => setPageFormat('image')} className={`min-h-[66px] rounded-md border px-3 text-left transition ${pageFormat === 'image' ? 'border-[#91b96c] bg-[#253126] text-white' : 'border-white/10 bg-[#151a18] text-[#a3ada6] hover:border-white/20'}`}><span className="block text-sm font-semibold">Adapter à l’image</span><span className="mt-1 block text-[11px] text-[#8b9790]">Taille native</span></button>
                <button type="button" role="radio" aria-checked={pageFormat === 'a4'} onClick={() => setPageFormat('a4')} className={`min-h-[66px] rounded-md border px-3 text-left transition ${pageFormat === 'a4' ? 'border-[#91b96c] bg-[#253126] text-white' : 'border-white/10 bg-[#151a18] text-[#a3ada6] hover:border-white/20'}`}><span className="block text-sm font-semibold">Format A4 standard</span><span className="mt-1 block text-[11px] text-[#8b9790]">Document imprimable</span></button>
              </div>
            </fieldset>

            {pageFormat === 'a4' && <fieldset className="mt-5"><legend className="mb-2.5 text-xs font-medium text-[#a8b2ab]">Orientation</legend><div className="grid grid-cols-2 gap-2"><button type="button" role="radio" aria-checked={orientation === 'portrait'} onClick={() => setOrientation('portrait')} className={`h-10 rounded-md border text-sm font-medium transition ${orientation === 'portrait' ? 'border-[#91b96c] bg-[#253126] text-white' : 'border-white/10 bg-[#151a18] text-[#a3ada6] hover:border-white/20'}`}>Portrait</button><button type="button" role="radio" aria-checked={orientation === 'landscape'} onClick={() => setOrientation('landscape')} className={`h-10 rounded-md border text-sm font-medium transition ${orientation === 'landscape' ? 'border-[#91b96c] bg-[#253126] text-white' : 'border-white/10 bg-[#151a18] text-[#a3ada6] hover:border-white/20'}`}>Paysage</button></div></fieldset>}

            <fieldset className="mt-5">
              <legend className="mb-2.5 text-xs font-medium text-[#a8b2ab]">Marge</legend>
              <div className="grid grid-cols-3 gap-2">
                {([{ id: 'none', label: 'Sans marge' }, { id: 'small', label: 'Petite' }, { id: 'large', label: 'Grande' }] as const).map((option) => <button key={option.id} type="button" role="radio" aria-checked={margin === option.id} onClick={() => setMargin(option.id)} className={`h-10 rounded-md border text-xs font-medium transition ${margin === option.id ? 'border-[#91b96c] bg-[#253126] text-white' : 'border-white/10 bg-[#151a18] text-[#a3ada6] hover:border-white/20'}`}>{option.label}</button>)}
              </div>
            </fieldset>

            <div className="mt-auto pt-6">
              <button type="button" onClick={convertToPdf} disabled={images.length === 0 || isConverting} className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#d7f36a] px-4 text-sm font-semibold text-[#192216] transition hover:bg-[#e1f98a] disabled:cursor-not-allowed disabled:bg-[#465044] disabled:text-[#9ba591]">{isConverting ? `Création du PDF… ${progress}%` : 'Convertir en PDF'}{!isConverting && <span aria-hidden="true">→</span>}</button>
              {isConverting && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#343b35]" role="progressbar" aria-label="Progression de la conversion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-[#d7f36a] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>}
              {result && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#45573e] bg-[#202a20] px-3.5 py-3"><span className="text-sm text-[#dce7d5]">PDF prêt · {formatSize(result.size)}</span><a href={result.url} download="pixelpress-images.pdf" className="inline-flex h-9 items-center gap-2 rounded-md bg-[#d7f36a] px-3 text-xs font-semibold text-[#192216] hover:bg-[#e1f98a]"><DownloadIcon />Télécharger le PDF</a></div>}
              <p className="mt-4 text-center text-xs text-[#7f8c84]">Conversion locale · Vos fichiers ne quittent pas votre appareil</p>
            </div>
          </section>
        </div>

        <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 text-xs text-[#75827a]"><span>Chaque image devient une page du PDF</span><nav aria-label="Liens rapides" className="flex gap-4"><Link href="/" className="hover:text-white">Tous les outils</Link><Link href="/image/compress" className="hover:text-white">Compresser une image</Link><Link href="/pdf" className="hover:text-white">Outils PDF</Link></nav></footer>
      </section>
    </main>
  );
}
