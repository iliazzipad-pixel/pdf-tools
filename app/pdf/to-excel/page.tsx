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

type PdfTextItem = { str: string; transform: number[]; width: number; height: number };
type PdfPage = { getTextContent: () => Promise<{ items: PdfTextItem[] }> };
type PdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PositionedTextItem = PdfTextItem & { x: number; y: number };
type TextLine = { y: number; items: PositionedTextItem[] };
type TableCell = { x: number; text: string };
type ExcelResult = { fileName: string; download: () => void };

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

function buildTableRows(items: PdfTextItem[]) {
  const orderedItems: PositionedTextItem[] = items
    .filter((item) => item.str.trim().length > 0 && Array.isArray(item.transform))
    .map((item) => ({ ...item, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 }))
    .sort((first, second) => second.y - first.y || first.x - second.x);

  const lines: TextLine[] = [];
  for (const item of orderedItems) {
    const currentLine = lines.at(-1);
    const verticalTolerance = Math.max(2, item.height * 0.45);
    if (currentLine && Math.abs(currentLine.y - item.y) <= verticalTolerance) {
      currentLine.items.push(item);
      currentLine.y = (currentLine.y * (currentLine.items.length - 1) + item.y) / currentLine.items.length;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }

  return lines.map((line) => {
    const cells: TableCell[] = [];
    let previousItem: PositionedTextItem | undefined;
    for (const item of line.items.sort((first, second) => first.x - second.x)) {
      const horizontalGap = previousItem ? item.x - (previousItem.x + previousItem.width) : 0;
      const newCell = !cells.length || horizontalGap > Math.max(16, item.height * 1.8);
      if (newCell) {
        cells.push({ x: item.x, text: item.str.trim() });
      } else {
        const previousCell = cells[cells.length - 1];
        if (!previousCell.text.endsWith(' ') && !item.str.startsWith(' ')) previousCell.text += ' ';
        previousCell.text += item.str.trim();
      }
      previousItem = item;
    }
    return cells.sort((first, second) => first.x - second.x).map((cell) => cell.text.trim());
  }).filter((row) => row.some((cell) => cell.length > 0));
}

export default function PdfToExcelPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<ExcelResult | null>(null);
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

  async function convertToExcel() {
    if (!file || pageCount === 0 || isReading) return;
    setIsReading(true);
    setResult(null);
    setError('');
    setProgress({ current: 0, total: pageCount });

    let pdf: PdfDocument | null = null;
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      await loadPdfJsScript();
      const sourcePdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise as PdfDocument;
      pdf = sourcePdf;

      for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
        setProgress({ current: pageNumber, total: sourcePdf.numPages });
        const page = await sourcePdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const rows = buildTableRows(content.items);
        const worksheet = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [['Aucun texte extrait']]);
        XLSX.utils.book_append_sheet(workbook, worksheet, `Page ${pageNumber}`);
      }

      const fileName = `${safeBaseName(file.name)}.xlsx`;
      const download = () => XLSX.writeFile(workbook, fileName);
      download();
      setResult({ fileName, download });
    } catch (conversionError) {
      console.error('Échec de la conversion PDF vers Excel :', conversionError);
      setError('La conversion a échoué. Vérifiez que le PDF est lisible et n’est pas protégé.');
    } finally {
      if (pdf) await pdf.destroy();
      setIsReading(false);
    }
  }

  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#111615] text-[#f4f6f3]">
      <header className="border-b border-white/10 bg-[#151b19]">
        <div className="mx-auto flex min-h-[72px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#23382b] text-[#68c785]" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5M8 12h8m-8 3h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#68c785]">Outil PDF vers Excel</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Retrouvez vos tableaux dans Excel.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#a2ada7]">Reconstituez les lignes et colonnes de votre PDF dans un classeur avec une feuille par page. Le traitement reste dans votre navigateur.</p>
        </div>

        <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="upload-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 01</p><h2 id="upload-heading" className="mt-1 text-lg font-semibold">Sélectionner un PDF</h2></div>
            <span className="rounded-md border border-white/10 bg-[#141917] px-2.5 py-1.5 text-xs font-medium text-[#bac4be]">PDF · XLSX</span>
          </div>

          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void selectPdf(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" disabled={isReading} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void selectPdf(event.dataTransfer.files[0]); }} className={`flex min-h-[150px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-wait ${isDragging ? 'border-[#68c785] bg-[#23382b]' : 'border-[#46534b] bg-[#151a18] hover:border-[#6d9b78] hover:bg-[#1c231f]'}`}>
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-[#23382b] text-[#68c785]"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5M8 12h8m-8 3h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
            <span className="text-sm font-semibold">{isReading ? 'Lecture ou analyse en cours…' : file ? 'Déposez un autre PDF ou cliquez pour remplacer' : 'Déposez votre PDF ici'}</span>
            <span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour sélectionner un fichier</span>
          </button>

          {error && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{error}</p>}

          {file && pageCount > 0 && <dl className="mt-5 grid gap-4 border-t border-white/[0.08] pt-4 sm:grid-cols-3">
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Document</dt><dd className="mt-1 truncate text-sm font-medium text-[#e7ebe8]" title={file.name}>{file.name}</dd></div>
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Pages estimées</dt><dd className="mt-1 text-sm font-medium text-[#e7ebe8]">{pageCount}</dd></div>
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Poids du fichier</dt><dd className="mt-1 text-sm font-medium text-[#e7ebe8]">{formatSize(file.size)}</dd></div>
          </dl>}
        </section>

        {file && pageCount > 0 && <section className="mt-5 rounded-[10px] border border-white/10 bg-[#1a201e] p-5 sm:p-6" aria-labelledby="convert-heading">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 02</p><h2 id="convert-heading" className="mt-1 text-lg font-semibold">Reconstituer les tableaux</h2><p className="mt-1 text-sm text-[#8e9b93]">Une feuille de calcul par page du PDF.</p></div>
            <button type="button" disabled={isReading} onClick={() => void convertToExcel()} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#d9f28b] px-5 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa] disabled:cursor-wait disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Convertir en Excel
            </button>
          </div>

          {isReading && progress.total > 0 && <div className="mt-5" role="status" aria-live="polite">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="text-[#dce4dc]">Reconstitution des tableaux : page {Math.min(progress.current, progress.total)} sur {progress.total}…</span><span className="tabular-nums text-[#9ba69e]">{progressPercent}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[#111615]"><div className="h-full rounded-full bg-[#68c785] transition-[width] duration-300" style={{ width: `${progressPercent}%` }} /></div>
          </div>}
        </section>}

        {result && <section className="mt-5 rounded-[10px] border border-[#496143]/50 bg-[#1b261d] p-5 sm:p-6" aria-labelledby="result-heading">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b9e38d]">Conversion terminée</p><h2 id="result-heading" className="mt-1 text-lg font-semibold">Votre classeur est prêt.</h2><p className="mt-1 text-sm text-[#a2ada7]">{result.fileName}</p></div>
            <button type="button" onClick={result.download} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#d9f28b] px-5 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa]">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Télécharger le fichier Excel (.xlsx)
            </button>
          </div>
        </section>}
      </section>
    </main>
  );
}