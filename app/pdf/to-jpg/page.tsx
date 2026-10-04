'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib: any;
  }
}

const PDFJS_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let pdfJsScriptPromise: Promise<void> | null = null;

type ConvertedPage = {
  pageNumber: number;
  width: number;
  height: number;
  url: string;
};

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

function downloadPage(page: ConvertedPage, fileName: string) {
  const link = document.createElement('a');
  link.href = page.url;
  link.download = `${fileName}-page-${String(page.pageNumber).padStart(3, '0')}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function PdfToJpgPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const pageUrlsRef = useRef<string[]>([]);
  const [fileName, setFileName] = useState('document');
  const [pages, setPages] = useState<ConvertedPage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => pageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function clearPages() {
    pageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    pageUrlsRef.current = [];
    setPages([]);
  }

  async function convertPdf(file?: File) {
    if (!file || isConverting) return;
    if (!isPdf(file)) {
      setError('Sélectionnez un fichier PDF valide.');
      return;
    }

    clearPages();
    setError('');
    setFileName(file.name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '-') || 'document');
    setIsConverting(true);
    setProgress('Chargement du document…');

    try {
      await loadPdfJsScript();
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const convertedPages: ConvertedPage[] = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        setProgress(`Conversion de la page ${pageNumber} sur ${pdf.numPages}…`);
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas indisponible.');

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Export JPEG impossible.')), 'image/jpeg', 0.9);
        });
        const url = URL.createObjectURL(blob);
        pageUrlsRef.current.push(url);
        convertedPages.push({ pageNumber, width: canvas.width, height: canvas.height, url });
        canvas.width = 0;
        canvas.height = 0;
        setPages([...convertedPages]);
      }

      await pdf.destroy();
      setProgress(`${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''} convertie${pdf.numPages > 1 ? 's' : ''}.`);
    } catch (conversionError) {
      console.error('Échec de la conversion PDF en JPG :', conversionError);
      clearPages();
      setError('Impossible de lire ce PDF. Il est peut-être protégé ou endommagé.');
      setProgress('');
    } finally {
      setIsConverting(false);
    }
  }

  function downloadAll() {
    pages.forEach((page, index) => {
      window.setTimeout(() => downloadPage(page, fileName), index * 250);
    });
  }

  return (
    <main className="min-h-screen bg-[#111615] text-[#f4f6f3]">
      <header className="border-b border-white/10 bg-[#151b19]">
        <div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#3b2928] text-[#f18d7e]" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5" stroke="currentColor" strokeWidth="1.6" /><path d="M7 16h10" stroke="#ffd166" strokeWidth="2" /></svg>
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">PixelPress</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#101413] p-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Accueil</Link>
            <Link href="/pdf" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Outils PDF</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mb-8 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#f18d7e]">Outil PDF vers image</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Chaque page, en image JPG.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#a2ada7]">Convertissez votre PDF en images JPEG haute résolution. Le traitement s’effectue dans votre navigateur.</p>
        </div>

        <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="upload-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 01</p><h2 id="upload-heading" className="mt-1 text-lg font-semibold">Ajouter un PDF</h2></div>
            <span className="rounded-md border border-white/10 bg-[#141917] px-2.5 py-1.5 text-xs font-medium text-[#bac4be]">PDF · JPG qualité 90 %</span>
          </div>

          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void convertPdf(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" disabled={isConverting} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void convertPdf(event.dataTransfer.files[0]); }} className={`flex min-h-[160px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-wait ${isDragging ? 'border-[#f18d7e] bg-[#332523]' : 'border-[#46534b] bg-[#151a18] hover:border-[#a77870] hover:bg-[#1c231f]'}`}>
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-[#3b2928] text-[#f18d7e]"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5M8 15h8" stroke="currentColor" strokeWidth="1.6" /></svg></span>
            <span className="text-sm font-semibold">{isConverting ? 'Conversion en cours…' : 'Déposez votre PDF ici'}</span>
            <span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour sélectionner un fichier</span>
          </button>

          {error && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{error}</p>}
          {progress && <p role="status" aria-live="polite" className="mt-3 text-sm text-[#bac4be]">{progress}</p>}
        </section>

        {pages.length > 0 && (
          <section className="mt-8" aria-labelledby="pages-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 id="pages-heading" className="text-lg font-semibold">Pages converties</h2><p className="mt-1 text-sm text-[#8e9b93]">{pages.length} image{pages.length > 1 ? 's' : ''} · {fileName}</p></div>
              <button type="button" onClick={downloadAll} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#d9f28b] px-4 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa]">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Tout télécharger
              </button>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map((page) => (
                <li key={page.pageNumber} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#1a201e]">
                  <div className="flex aspect-[4/3] items-center justify-center bg-[#151a18] p-3"><Image src={page.url} alt={`Page ${page.pageNumber} convertie en JPG`} width={page.width} height={page.height} unoptimized className="max-h-full max-w-full object-contain" sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw" /></div>
                  <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] p-3">
                    <span className="text-sm font-medium">Page {page.pageNumber}</span>
                    <button type="button" onClick={() => downloadPage(page, fileName)} className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-semibold text-[#dce4dc] transition hover:border-white/25 hover:bg-white/[0.06]">
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Télécharger la page
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </section>
    </main>
  );
}