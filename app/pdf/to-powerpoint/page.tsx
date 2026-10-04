'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib: any;
  }
}

const PDFJS_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let pdfJsScriptPromise: Promise<void> | null = null;

type PdfPage = { getViewport: (options: { scale: number }) => { width: number; height: number }; render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } };
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PresentationResult = { fileName: string; download: () => Promise<unknown> };

function loadPdfJsScript(): Promise<void> {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
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
        reject(new Error('La bibliothèque PDF.js est indisponible.'));
        return;
      }
      script.dataset.loaded = 'true';
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      pdfJsScriptPromise = null;
      reject(new Error('Impossible de charger PDF.js depuis le CDN.'));
    }, { once: true });
    if (!existingScript) document.head.appendChild(script);
    else if (existingScript.dataset.loaded === 'true') {
      pdfJsScriptPromise = null;
      reject(new Error('Le script PDF.js existe, mais sa bibliothèque est indisponible.'));
    }
  });

  return pdfJsScriptPromise;
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function safeBaseName(name: string) {
  return name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'document';
}

export default function PdfToPowerPointPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<PresentationResult | null>(null);
  const [error, setError] = useState('');

  async function selectPdf(selectedFile?: File) {
    if (!selectedFile) return;
    if (!isPdf(selectedFile)) {
      setError('Sélectionnez un fichier PDF valide.');
      return;
    }

    setFile(selectedFile);
    setPageCount(0);
    setResult(null);
    setError('');
    setProgress({ current: 0, total: 0 });
    setIsReading(true);
    try {
      await loadPdfJsScript();
      const pdf = await window.pdfjsLib.getDocument({ data: await selectedFile.arrayBuffer() }).promise as PdfDocument;
      setPageCount(pdf.numPages);
      await pdf.destroy();
    } catch (readError) {
      console.error('Impossible de lire les métadonnées du PDF :', readError);
      setFile(null);
      setError('Impossible de lire ce PDF. Il est peut-être protégé ou endommagé.');
    } finally {
      setIsReading(false);
    }
  }

  async function convertToPowerPoint() {
    if (!file || pageCount === 0 || isReading) return;
    setIsReading(true);
    setResult(null);
    setError('');
    setProgress({ current: 0, total: pageCount });

    let pdf: PdfDocument | null = null;
    try {
      const pptxModule = await import('pptxgenjs');
      const pptx = new pptxModule.default();
      pptx.layout = 'LAYOUT_16x9';
      pptx.author = 'PixelPress';
      pptx.subject = `Conversion de ${file.name}`;
      pptx.title = safeBaseName(file.name);

      await loadPdfJsScript();
      const sourcePdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise as PdfDocument;
      pdf = sourcePdf;

      for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
        setProgress({ current: pageNumber, total: sourcePdf.numPages });
        const page = await sourcePdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas indisponible.');

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const imageData = canvas.toDataURL('image/png');
        const slide = pptx.addSlide();
        slide.addImage({ data: imageData, x: 0, y: 0, w: '100%', h: '100%' });
        canvas.width = 0;
        canvas.height = 0;
      }

      const fileName = `${safeBaseName(file.name)}.pptx`;
      await pptx.writeFile({ fileName });
      setResult({ fileName, download: () => pptx.writeFile({ fileName }) });
    } catch (conversionError) {
      console.error('Échec de la conversion PDF vers PowerPoint :', conversionError);
      setError('La conversion a échoué. Vérifiez que le PDF est lisible et n’est pas protégé.');
    } finally {
      if (pdf) await pdf.destroy();
      setIsReading(false);
    }
  }

  async function downloadAgain() {
    if (!result) return;
    try {
      await result.download();
    } catch (downloadError) {
      console.error('Impossible de télécharger la présentation PowerPoint :', downloadError);
      setError('Le téléchargement a échoué. Relancez la conversion pour réessayer.');
    }
  }

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#111615] text-[#f4f6f3]">
      <header className="border-b border-white/10 bg-[#151b19]">
        <div className="mx-auto flex min-h-[72px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#3a2c24] text-[#f29b62]" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5M8 12h8m-8 3h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">PixelPress</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#101413] p-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Accueil</Link>
            <Link href="/pdf" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Outils PDF</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#f29b62]">Outil PDF vers PowerPoint</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Chaque page, une diapositive.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#a2ada7]">Transformez votre PDF en présentation 16:9. Chaque page est rendue en image haute résolution et intégrée dans une diapositive.</p>
        </div>

        <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="upload-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 01</p><h2 id="upload-heading" className="mt-1 text-lg font-semibold">Sélectionner un PDF</h2></div>
            <span className="rounded-md border border-white/10 bg-[#141917] px-2.5 py-1.5 text-xs font-medium text-[#bac4be]">PDF · PPTX</span>
          </div>

          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void selectPdf(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" disabled={isReading} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void selectPdf(event.dataTransfer.files[0]); }} className={`flex min-h-[150px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-wait ${isDragging ? 'border-[#f29b62] bg-[#3a2c24]' : 'border-[#46534b] bg-[#151a18] hover:border-[#aa7958] hover:bg-[#1c231f]'}`}>
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-[#3a2c24] text-[#f29b62]"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5M8 12h8m-8 3h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
            <span className="text-sm font-semibold">{isReading ? 'Lecture ou conversion en cours…' : file ? 'Déposez un autre PDF ou cliquez pour remplacer' : 'Déposez votre PDF ici'}</span>
            <span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour sélectionner un fichier</span>
          </button>

          {error && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{error}</p>}

          {file && pageCount > 0 && <dl className="mt-5 grid gap-4 border-t border-white/[0.08] pt-4 sm:grid-cols-3">
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Document</dt><dd className="mt-1 truncate text-sm font-medium text-[#e7ebe8]" title={file.name}>{file.name}</dd></div>
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Nombre de pages</dt><dd className="mt-1 text-sm font-medium text-[#e7ebe8]">{pageCount}</dd></div>
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Poids du fichier</dt><dd className="mt-1 text-sm font-medium text-[#e7ebe8]">{formatSize(file.size)}</dd></div>
          </dl>}
        </section>

        {file && pageCount > 0 && <section className="mt-5 rounded-[10px] border border-white/10 bg-[#1a201e] p-5 sm:p-6" aria-labelledby="convert-heading">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 02</p><h2 id="convert-heading" className="mt-1 text-lg font-semibold">Créer la présentation</h2><p className="mt-1 text-sm text-[#8e9b93]">Une diapositive 16:9 par page PDF, en haute résolution.</p></div>
            <button type="button" disabled={isReading} onClick={() => void convertToPowerPoint()} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#d9f28b] px-5 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa] disabled:cursor-wait disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Convertir en PowerPoint
            </button>
          </div>

          {isReading && progress.total > 0 && <div className="mt-5" role="status" aria-live="polite">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-[#dce4dc]">Conversion de la diapositive {Math.min(progress.current, progress.total)} sur {progress.total}…</span><span className="tabular-nums text-[#9ba69e]">{progressPercent}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[#111615]"><div className="h-full rounded-full bg-[#f29b62] transition-[width] duration-300" style={{ width: `${progressPercent}%` }} /></div>
          </div>}
        </section>}

        {result && <section className="mt-5 rounded-[10px] border border-[#496143]/50 bg-[#1b261d] p-5 sm:p-6" aria-labelledby="result-heading">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b9e38d]">Conversion terminée</p><h2 id="result-heading" className="mt-1 text-lg font-semibold">Votre présentation est prête.</h2><p className="mt-1 text-sm text-[#a2ada7]">{result.fileName}</p></div>
            <button type="button" onClick={() => void downloadAgain()} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#d9f28b] px-5 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa]">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Télécharger le fichier PowerPoint (.pptx)
            </button>
          </div>
        </section>}
      </section>
    </main>
  );
}