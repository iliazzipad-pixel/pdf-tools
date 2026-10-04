'use client';

const promiseWithTry = Promise as unknown as { try?: (fn: () => unknown) => Promise<unknown> };
if (typeof promiseWithTry.try !== 'function') {
  promiseWithTry.try = function (fn: () => unknown) {
    return new Promise<unknown>((resolve) => resolve(fn()));
  };
}

import { PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib: any;
  }
}

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const PDFJS_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
let pdfJsScriptPromise: Promise<void> | null = null;

type DownloadResult = {
  url: string;
  name: string;
  size: number;
};

type MergePage = {
  id: string;
  file: File;
  sourcePageIndex: number;
  pageNumber: number;
  previewUrl: string;
};

const CLEAN_PRESETS = [
  {
    id: 'extreme',
    title: 'COMPRESSION EXTRÊME',
    description: 'Résolution réduite, compression agressive',
    mode: 'raster' as const,
    scale: 0.9,
    quality: 0.42,
  },
  {
    id: 'recommended',
    title: 'COMPRESSION RECOMMANDÉE',
    description: 'Bonne qualité, bonne compression',
    mode: 'raster' as const,
    scale: 1.45,
    quality: 0.72,
  },
  {
    id: 'light',
    title: 'BASSE COMPRESSION',
    description: 'Haute qualité, métadonnées nettoyées uniquement',
    mode: 'clean' as const,
    scale: 1,
    quality: 1,
  },
] as const;

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function loadPdfJsScript(): Promise<void> {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return Promise.resolve();
  }
  if (pdfJsScriptPromise) return pdfJsScriptPromise;

  pdfJsScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${PDFJS_SCRIPT_URL}"]`);
    const script = existingScript ?? document.createElement('script');
    script.src = PDFJS_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () => {
      if (!window.pdfjsLib) {
        pdfJsScriptPromise = null;
        reject(new Error('Le script PDF.js est chargé, mais window.pdfjsLib est indisponible.'));
        return;
      }
      script.dataset.loaded = 'true';
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      pdfJsScriptPromise = null;
      reject(new Error(`Impossible de charger le script PDF.js : ${PDFJS_SCRIPT_URL}`));
    }, { once: true });
    if (!existingScript) document.head.appendChild(script);
    else if (existingScript.dataset.loaded === 'true') {
      pdfJsScriptPromise = null;
      reject(new Error('La balise PDF.js existe déjà, mais la bibliothèque globale n’est pas disponible.'));
    }
  });

  return pdfJsScriptPromise;
}

async function loadPdfJsDocument(file: File) {
  await loadPdfJsScript();
  const arrayBuffer = await file.arrayBuffer();
  return window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

function PdfMark() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#153b32] text-[#d7f36a]" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
        <path d="M13.5 3.75H6.75A1.75 1.75 0 0 0 5 5.5v13A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V9.25L13.5 3.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M13 4v5.5h5.5M8 15h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export default function PdfToolsPage() {
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const cleanInputRef = useRef<HTMLInputElement>(null);
  const mergeUrlRef = useRef<string | null>(null);
  const cleanUrlRef = useRef<string | null>(null);
  const [mergePages, setMergePages] = useState<MergePage[]>([]);
  const [mergeResult, setMergeResult] = useState<DownloadResult | null>(null);
  const [cleanFile, setCleanFile] = useState<File | null>(null);
  const [cleanResult, setCleanResult] = useState<DownloadResult | null>(null);
  const [mergeDragging, setMergeDragging] = useState(false);
  const [cleanDragging, setCleanDragging] = useState(false);
  const [busyTool, setBusyTool] = useState<'thumbnails' | 'merge' | 'clean' | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<(typeof CLEAN_PRESETS)[number]['id']>('recommended');
  const [mergeError, setMergeError] = useState('');
  const [cleanError, setCleanError] = useState('');
  const [thumbnailProgress, setThumbnailProgress] = useState('');
  const selectedPreset = CLEAN_PRESETS.find((preset) => preset.id === selectedPresetId) ?? CLEAN_PRESETS[1];

  useEffect(() => () => {
    if (mergeUrlRef.current) URL.revokeObjectURL(mergeUrlRef.current);
    if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current);
  }, []);

  async function setMergeSelection(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(isPdf);
    if (pdfs.length !== files.length) setMergeError('Seuls les fichiers PDF peuvent être fusionnés.');
    else setMergeError('');
    if (pdfs.length === 0 || busyTool) return;
    const existingKeys = new Set(mergePages.map(({ file }) => `${file.name}-${file.size}-${file.lastModified}`));
    const additions = pdfs.filter((file, index) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (existingKeys.has(key) || pdfs.slice(0, index).some((previous) => `${previous.name}-${previous.size}-${previous.lastModified}` === key)) return false;
      return true;
    });
    if (additions.length === 0) return;

    setBusyTool('thumbnails');
    setThumbnailProgress('Lecture des pages…');
    try {
      const newPages: MergePage[] = [];
      for (const file of additions) {
        const pdf = await loadPdfJsDocument(file);
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          setThumbnailProgress(`${file.name} · page ${pageNumber} sur ${pdf.numPages}`);
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas indisponible.');
          try {
            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: 190 / baseViewport.width });
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, canvasContext: context, viewport }).promise;
          } catch (err) {
            console.error(`Échec du rendu de la page ${pageNumber} du PDF « ${file.name} ». La page sera conservée avec une vignette de secours.`, err);
            canvas.width = 190;
            canvas.height = 250;
            context.fillStyle = '#f4f4f0';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = '#59645d';
            context.font = '13px sans-serif';
            context.textAlign = 'center';
            context.fillText('Aperçu indisponible', canvas.width / 2, canvas.height / 2);
          }
          const previewUrl = canvas.toDataURL('image/jpeg', 0.76);
          newPages.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            sourcePageIndex: pageNumber - 1,
            pageNumber,
            previewUrl,
          });
          canvas.width = 0;
          canvas.height = 0;
        }
        await pdf.destroy();
      }
      if (mergeUrlRef.current) URL.revokeObjectURL(mergeUrlRef.current);
      mergeUrlRef.current = null;
      setMergeResult(null);
      setMergePages((current) => [...current, ...newPages]);
    } catch (err) {
      console.error('Impossible de lire le document PDF pour générer les vignettes :', err);
      setMergeError('Impossible de lire ce PDF. Il est peut-être protégé ou endommagé.');
    } finally {
      setBusyTool(null);
      setThumbnailProgress('');
    }
  }

  function setCleanSelection(file?: File) {
    if (!file) return;
    if (!isPdf(file)) {
      setCleanError('Sélectionnez un fichier PDF valide.');
      return;
    }
    if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current);
    cleanUrlRef.current = null;
    setCleanFile(file);
    setCleanResult(null);
    setCleanError('');
  }

  function updateMergeOrder(index: number, offset: number) {
    setMergePages((current) => {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
      return reordered;
    });
    if (mergeUrlRef.current) URL.revokeObjectURL(mergeUrlRef.current);
    mergeUrlRef.current = null;
    setMergeResult(null);
  }

  function removeMergeFile(index: number) {
    setMergePages((current) => current.filter((_, pageIndex) => pageIndex !== index));
    if (mergeUrlRef.current) URL.revokeObjectURL(mergeUrlRef.current);
    mergeUrlRef.current = null;
    setMergeResult(null);
  }

  async function mergePdfs() {
    if (mergePages.length < 1 || busyTool) return;
    setBusyTool('merge');
    setMergeError('');
    try {
      const mergedPdf = await PDFDocument.create();
      const sourceDocuments = new Map<File, PDFDocument>();
      for (const pageItem of mergePages) {
        let sourcePdf = sourceDocuments.get(pageItem.file);
        if (!sourcePdf) {
          const arrayBuffer = await pageItem.file.arrayBuffer();
          sourcePdf = await PDFDocument.load(arrayBuffer);
          sourceDocuments.set(pageItem.file, sourcePdf);
        }
        const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [pageItem.sourcePageIndex]);
        mergedPdf.addPage(copiedPage);
      }
      const bytes = await mergedPdf.save({ useObjectStreams: true });
      if (mergeUrlRef.current) URL.revokeObjectURL(mergeUrlRef.current);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      mergeUrlRef.current = url;
      setMergeResult({ url, name: 'pdf-fusionne.pdf', size: bytes.byteLength });
    } catch {
      setMergeError('La fusion a échoué. Vérifiez que les fichiers ne sont pas protégés ou endommagés.');
    } finally {
      setBusyTool(null);
    }
  }

  async function cleanPdf() {
    if (!cleanFile || busyTool) return;
    setBusyTool('clean');
    setCleanError('');
    try {
      const pdf = await PDFDocument.load(await cleanFile.arrayBuffer(), { updateMetadata: false });
      let bytes: Uint8Array;
      if (selectedPreset.mode === 'raster') {
        const renderedPdf = await loadPdfJsDocument(cleanFile);
        const outputPdf = await PDFDocument.create();
        for (let pageNumber = 1; pageNumber <= renderedPdf.numPages; pageNumber += 1) {
          const sourcePage = await renderedPdf.getPage(pageNumber);
          const viewport = sourcePage.getViewport({ scale: selectedPreset.scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas indisponible.');
          await sourcePage.render({ canvas, canvasContext: context, viewport }).promise;
          const imageBytes = new Uint8Array(await (await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Compression de page impossible.')), 'image/jpeg', selectedPreset.quality);
          })).arrayBuffer());
          const embeddedImage = await outputPdf.embedJpg(imageBytes);
          const pageWidth = viewport.width / selectedPreset.scale;
          const pageHeight = viewport.height / selectedPreset.scale;
          const outputPage = outputPdf.addPage([pageWidth, pageHeight]);
          outputPage.drawImage(embeddedImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
          canvas.width = 0;
          canvas.height = 0;
        }
        await renderedPdf.destroy();
        bytes = await outputPdf.save({ useObjectStreams: true });
      } else {
        const infoRef = pdf.context.trailerInfo.Info;
        if (infoRef instanceof PDFRef) pdf.context.delete(infoRef);
        pdf.context.trailerInfo.Info = undefined;
        pdf.catalog.delete(PDFName.of('Metadata'));
        bytes = await pdf.save({ useObjectStreams: false });
      }
      if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      cleanUrlRef.current = url;
      setCleanResult({
        url,
        name: `nettoye-${cleanFile.name}`,
        size: bytes.byteLength,
      });
    } catch {
      setCleanError('Le nettoyage a échoué. Vérifiez que le PDF n’est pas protégé ou endommagé.');
    } finally {
      setBusyTool(null);
    }
  }

  const cleanSavedPercent = cleanResult && cleanFile
    ? Math.max(0, Math.round((1 - cleanResult.size / cleanFile.size) * 100))
    : 0;

  return (
    <main className="min-h-screen bg-[#111615] text-[#f4f6f3]">
      <header className="border-b border-white/10 bg-[#151b19]">
        <div className="mx-auto flex min-h-[72px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Pixelpress, accueil">
            <PdfMark />
            <span className="text-[17px] font-semibold tracking-[-0.02em]">pixelpress</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#101413] p-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Compresseur d’images</Link>
            <Link href="/pdf" aria-current="page" className="rounded-md bg-[#293a32] px-3 py-2 font-medium text-[#d7f36a]">Boîte à outils PDF</Link>
          </nav>
          <span className="hidden text-xs text-[#89968e] md:block">Traitement privé dans votre navigateur</span>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#a5c574]">Outils PDF</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Tout votre PDF, au même endroit.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#a2ada7]">Fusionnez des documents ou nettoyez un PDF en quelques instants. Vos fichiers restent sur votre appareil.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="merge-heading">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Outil 01</p>
                <h2 id="merge-heading" className="mt-1 text-xl font-semibold tracking-[-0.02em]">Fusionner des PDF</h2>
              </div>
              <span className="rounded-md border border-white/10 bg-[#141917] px-2.5 py-1.5 text-xs font-medium text-[#bac4be]">Plusieurs fichiers</span>
            </div>

            <input
              ref={mergeInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) setMergeSelection(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => mergeInputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setMergeDragging(true); }}
              onDragLeave={() => setMergeDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setMergeDragging(false);
                setMergeSelection(event.dataTransfer.files);
              }}
              disabled={busyTool !== null}
              className={`flex min-h-[128px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-wait ${mergeDragging ? 'border-[#96b86b] bg-[#273329]' : 'border-[#46534b] bg-[#151a18] hover:border-[#758b68] hover:bg-[#1c231f]'}`}
            >
              <span className="text-sm font-semibold">{busyTool === 'thumbnails' ? 'Préparation des pages…' : 'Déposez vos PDF ici'}</span>
              <span className="mt-1 text-xs text-[#8e9b93]">{busyTool === 'thumbnails' ? thumbnailProgress : 'ou cliquez pour sélectionner plusieurs fichiers'}</span>
            </button>

            {mergeError && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{mergeError}</p>}
            {mergePages.length > 0 ? (
              <ol className="mt-4 grid max-h-[540px] grid-cols-2 gap-3 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#151a18] p-3 sm:grid-cols-3">
                {mergePages.map((page, index) => (
                  <li key={page.id} className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-[#202623]">
                    <div className="relative flex aspect-[3/4] items-center justify-center bg-[#e8e9e5] p-2">
                      <Image src={page.previewUrl} alt={`Aperçu de la page ${index + 1}`} fill unoptimized className="object-contain p-2" sizes="(max-width: 640px) 45vw, 200px" />
                      <span className="absolute left-2 top-2 rounded bg-[#151a18]/90 px-2 py-1 text-[10px] font-bold text-white">Page {index + 1}</span>
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-[11px] font-medium text-[#d9dfdb]" title={`${page.file.name} · page ${page.pageNumber}`}>{page.file.name}</p>
                      <div className="mt-2 flex items-center justify-between gap-1">
                        <button type="button" onClick={() => updateMergeOrder(index, -1)} disabled={index === 0 || busyTool !== null} aria-label={`Déplacer la page ${index + 1} à gauche`} title="Déplacer à gauche / Monter" className="grid h-8 w-8 place-items-center rounded border border-white/10 text-[#b8c3bc] hover:bg-white/10 disabled:opacity-30">←</button>
                        <span className="text-[10px] tabular-nums text-[#7e8c83]">{formatSize(page.file.size)}</span>
                        <button type="button" onClick={() => updateMergeOrder(index, 1)} disabled={index === mergePages.length - 1 || busyTool !== null} aria-label={`Déplacer la page ${index + 1} à droite`} title="Déplacer à droite / Descendre" className="grid h-8 w-8 place-items-center rounded border border-white/10 text-[#b8c3bc] hover:bg-white/10 disabled:opacity-30">→</button>
                        <button type="button" onClick={() => removeMergeFile(index)} disabled={busyTool !== null} aria-label={`Supprimer la page ${index + 1}`} title="Supprimer cette page" className="grid h-8 w-8 place-items-center rounded border border-[#573b38] text-[#ed9e90] hover:bg-[#6b302b]/30 disabled:opacity-30">×</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-4 flex min-h-[150px] items-center justify-center rounded-lg border border-white/[0.07] bg-[#151a18] px-5 text-center text-sm text-[#87948c]">Les pages PDF apparaîtront ici sous forme de vignettes réorganisables.</div>
            )}

            <button
              type="button"
              onClick={mergePdfs}
              disabled={mergePages.length < 1 || busyTool !== null}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#d7f36a] px-4 text-sm font-semibold text-[#192216] transition hover:bg-[#e1f98a] disabled:cursor-not-allowed disabled:bg-[#465044] disabled:text-[#9ba591]"
            >
              {busyTool === 'merge' ? 'Fusion en cours…' : 'Fusionner les PDF'}
              {busyTool !== 'merge' && <span aria-hidden="true">→</span>}
            </button>
            {mergeResult && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#45573e] bg-[#202a20] px-3.5 py-3">
                <span className="text-sm text-[#dce7d5]">PDF fusionné · {formatSize(mergeResult.size)}</span>
                <a href={mergeResult.url} download={mergeResult.name} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#d7f36a] px-3 text-xs font-semibold text-[#192216] hover:bg-[#e1f98a]"><DownloadIcon />Télécharger</a>
              </div>
            )}
          </section>

          <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="clean-heading">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Outil 02</p>
                <h2 id="clean-heading" className="mt-1 text-xl font-semibold tracking-[-0.02em]">Optimiser / nettoyer</h2>
              </div>
              <span className="rounded-md border border-white/10 bg-[#141917] px-2.5 py-1.5 text-xs font-medium text-[#bac4be]">Un fichier</span>
            </div>

            <input
              ref={cleanInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => setCleanSelection(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => cleanInputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setCleanDragging(true); }}
              onDragLeave={() => setCleanDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setCleanDragging(false);
                setCleanSelection(event.dataTransfer.files[0]);
              }}
              className={`flex min-h-[128px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors ${cleanDragging ? 'border-[#96b86b] bg-[#273329]' : 'border-[#46534b] bg-[#151a18] hover:border-[#758b68] hover:bg-[#1c231f]'}`}
            >
              <span className="text-sm font-semibold">{cleanFile ? 'Remplacer le PDF' : 'Déposez un PDF ici'}</span>
              <span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour sélectionner un document</span>
            </button>

            {cleanError && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{cleanError}</p>}
            {cleanFile ? (
              <div className="mt-4 rounded-lg border border-white/[0.08] bg-[#151a18] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#2b332d] text-[10px] font-bold text-[#d0e2b5]">PDF</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#e7ebe8]" title={cleanFile.name}>{cleanFile.name}</span>
                    <span className="mt-1 block text-xs text-[#87948c]">Taille initiale · {formatSize(cleanFile.size)}</span>
                  </span>
                </div>
                {cleanFile.size > MAX_FILE_SIZE && <p className="mt-3 inline-flex rounded-full border border-[#5e5837] bg-[#302d20] px-2.5 py-1 text-[11px] font-medium text-[#d9cf8d]">Fichiers volumineux réservés à l&apos;offre Pro</p>}
              </div>
            ) : (
              <div className="mt-4 flex min-h-[120px] items-center justify-center rounded-lg border border-white/[0.07] bg-[#151a18] px-5 text-center text-sm text-[#87948c]">Choisissez un document à optimiser.</div>
            )}

            <div className="mt-4 rounded-lg border border-[#292b2d] bg-[#121514] p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#f08070]">Niveau de compression</h3>
                <span className="text-[10px] text-[#89918d]">PDF</span>
              </div>
              <div className="grid gap-2">
                {CLEAN_PRESETS.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={busyTool !== null}
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`flex min-h-[66px] w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${isSelected ? 'border-[#8eb469] bg-[#222824]' : 'border-[#343739] bg-[#1b1e1d] hover:border-[#68605d]'}`}
                    >
                      <span className="min-w-0">
                        <span className={`block text-[10px] font-bold tracking-[0.055em] ${isSelected ? 'text-[#f08070]' : 'text-[#e5e7e6]'}`}>{preset.title}</span>
                        <span className="mt-1 block text-[11px] leading-4 text-[#a7aeab]">{preset.description}</span>
                      </span>
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${isSelected ? 'border-[#84ad61] bg-[#84ad61] text-[#142015]' : 'border-[#616867] text-transparent'}`} aria-hidden="true">
                        {isSelected && <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5"><path d="m3.5 8.2 2.8 2.7 6.2-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedPreset.mode === 'raster' && <p className="mt-3 text-[10px] leading-4 text-[#8e9892]">Ce niveau convertit chaque page en image pour réduire le poids; le texte ne sera plus sélectionnable.</p>}
            </div>

            <button
              type="button"
              onClick={cleanPdf}
              disabled={!cleanFile || busyTool !== null}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#d7f36a] px-4 text-sm font-semibold text-[#192216] transition hover:bg-[#e1f98a] disabled:cursor-not-allowed disabled:bg-[#465044] disabled:text-[#9ba591]"
            >
              {busyTool === 'clean' ? 'Nettoyage en cours…' : 'Optimiser et nettoyer le PDF'}
              {busyTool !== 'clean' && <span aria-hidden="true">→</span>}
            </button>
            {cleanResult && cleanFile && (
              <div className="mt-4 rounded-md border border-[#45573e] bg-[#202a20] p-3.5">
                <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
                  <div className="px-2"><p className="text-[11px] text-[#91a096]">Avant</p><p className="mt-1 text-sm font-semibold">{formatSize(cleanFile.size)}</p></div>
                  <div className="px-2"><p className="text-[11px] text-[#91a096]">Après</p><p className="mt-1 text-sm font-semibold text-[#d7f36a]">{formatSize(cleanResult.size)}</p></div>
                  <div className="px-2"><p className="text-[11px] text-[#91a096]">Économisé</p><p className="mt-1 text-sm font-semibold text-[#d7f36a]">{cleanSavedPercent}%</p></div>
                </div>
                <a href={cleanResult.url} download={cleanResult.name} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#d7f36a] text-xs font-semibold text-[#192216] hover:bg-[#e1f98a]"><DownloadIcon />Télécharger le PDF nettoyé</a>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 text-xs text-[#75827a]">
          <span>Fusion et optimisation traitées localement</span>
          <span>Aucun document n’est envoyé sur un serveur</span>
          <nav aria-label="Liens rapides" className="flex gap-4">
            <Link href="/" className="hover:text-white">Tous les outils</Link>
            <Link href="/image/compress" className="hover:text-white">Compresser une image</Link>
          </nav>
        </footer>
      </section>
    </main>
  );
}