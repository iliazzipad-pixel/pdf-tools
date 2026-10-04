'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

type ProcessStage = 'idle' | 'reading' | 'generating' | 'done';
type PdfResult = { fileName: string; blob: Blob };

const ALLOWED_TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'COL', 'COLGROUP', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'I', 'LI', 'OL', 'P', 'S', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U',
]);
const BLOCKED_TAGS = new Set(['IFRAME', 'IMG', 'OBJECT', 'SCRIPT', 'STYLE', 'SVG', 'VIDEO', 'AUDIO']);

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function safeBaseName(name: string) {
  return name.replace(/\.docx?$/i, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'document';
}

function sanitizeMammothHtml(html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');

  function copyNode(source: Node): Node | null {
    if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent ?? '');
    if (!(source instanceof Element) || BLOCKED_TAGS.has(source.tagName)) return null;

    if (!ALLOWED_TAGS.has(source.tagName)) {
      const fragment = document.createDocumentFragment();
      source.childNodes.forEach((child) => {
        const safeChild = copyNode(child);
        if (safeChild) fragment.appendChild(safeChild);
      });
      return fragment;
    }

    const element = document.createElement(source.tagName.toLowerCase());
    if (source.tagName === 'TD' || source.tagName === 'TH') {
      for (const attribute of ['colspan', 'rowspan']) {
        const value = source.getAttribute(attribute);
        if (value && /^\d{1,2}$/.test(value)) element.setAttribute(attribute, value);
      }
    }
    source.childNodes.forEach((child) => {
      const safeChild = copyNode(child);
      if (safeChild) element.appendChild(safeChild);
    });
    return element;
  }

  parsed.body.childNodes.forEach((node) => {
    const safeNode = copyNode(node);
    if (safeNode) output.appendChild(safeNode);
  });
  return output.innerHTML;
}

function createPdfContainer(html: string) {
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.className = 'word-pdf-render bg-white text-black';
  container.style.cssText = 'position:static;width:794px;min-height:1123px;margin:0 auto;padding:40px;background-color:#ffffff!important;color:#000000!important;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;';
  container.innerHTML = html;

  const style = document.createElement('style');
  style.textContent = `
    .word-pdf-render, .word-pdf-render * { box-sizing: border-box; }
    .word-pdf-render { background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; }
    .word-pdf-render p { margin: 0 0 12px; font-size: 14px; line-height: 1.6; color: #111827 !important; }
    .word-pdf-render h1 { margin: 0 0 16px; font-size: 24px; font-weight: bold; line-height: 1.25; color: #000000 !important; }
    .word-pdf-render h2 { margin: 0 0 12px; font-size: 20px; font-weight: bold; line-height: 1.3; color: #000000 !important; }
    .word-pdf-render h3, .word-pdf-render h4, .word-pdf-render h5, .word-pdf-render h6 { margin: 14px 0 8px; color: #000000 !important; }
    .word-pdf-render ul, .word-pdf-render ol { margin: 0 0 12px; padding-left: 24px; color: #111827 !important; }
    .word-pdf-render li { margin: 0 0 4px; color: #111827 !important; }
    .word-pdf-render table { width: 100%; border-collapse: collapse; margin: 0 0 16px; color: #111827 !important; }
    .word-pdf-render td, .word-pdf-render th { border: 1px solid #d1d5db; padding: 8px; color: #111827 !important; vertical-align: top; }
    .word-pdf-render th { background: #f3f4f6 !important; font-weight: 700; }
    .word-pdf-render blockquote { margin: 12px 0; padding-left: 12px; border-left: 3px solid #9ca3af; color: #111827 !important; }
    .word-pdf-render tr, .word-pdf-render img { page-break-inside: avoid; }
  `;
  document.head.appendChild(style);
  document.body.appendChild(container);
  return { container, style };
}

async function generatePdf(html: string, fileName: string) {
  const { container, style } = createPdfContainer(html);
  try {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
    const html2pdfModule = await import('html2pdf.js');
    const worker = html2pdfModule.default().set({
      margin: 10,
      filename: fileName,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(container);
    await worker.save();
    return await worker.outputPdf('blob') as Blob;
  } finally {
    container.remove();
    style.remove();
  }
}

function downloadPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WordToPdfPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<ProcessStage>('idle');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState('');

  function selectWord(selectedFile?: File) {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
      setError('Sélectionnez un document Word au format .docx.');
      return;
    }
    setFile(selectedFile);
    setResult(null);
    setError('');
    setStatus('');
    setStage('idle');
  }

  async function convertToPdf() {
    if (!file || stage === 'reading' || stage === 'generating') return;
    setError('');
    setResult(null);
    setStage('reading');
    setStatus('Lecture du document Word...');

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const arrayBuffer = await file.arrayBuffer();
      const mammoth = await import('mammoth');
      const conversion = await mammoth.convertToHtml({ arrayBuffer });
      const safeHtml = sanitizeMammothHtml(conversion.value);
      if (!safeHtml.trim()) throw new Error('Aucun contenu convertible dans ce document.');

      const fileName = `${safeBaseName(file.name)}.pdf`;
      setStage('generating');
      setStatus('Génération du PDF...');
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const blob = await generatePdf(safeHtml, fileName);
      setResult({ fileName, blob });
      setStage('done');
      setStatus('Conversion terminée.');
    } catch (conversionError) {
      console.error('Échec de la conversion Word vers PDF :', conversionError);
      setStage('idle');
      setStatus('');
      setError('La conversion a échoué. Vérifiez que le fichier Word est lisible et non endommagé.');
    }
  }

  async function downloadAgain() {
    if (!result) return;
    setError('');
    try {
      downloadPdf(result.blob, result.fileName);
    } catch (downloadError) {
      console.error('Échec du téléchargement PDF :', downloadError);
      setStage('done');
      setError('Le téléchargement a échoué. Relancez la conversion pour réessayer.');
    }
  }

  const isProcessing = stage === 'reading' || stage === 'generating';

  return (
    <main className="min-h-screen bg-[#111615] text-[#f4f6f3]">
      <header className="border-b border-white/10 bg-[#151b19]">
        <div className="mx-auto flex min-h-[72px] max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#253348] text-[#71a9f7]" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5M8 12h8m-8 3h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#71a9f7]">Outil Word vers PDF</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Votre document Word, en PDF.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#a2ada7]">Convertissez vos documents DOCX en PDF A4 directement dans votre navigateur.</p>
        </div>

        <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.14)] sm:p-6" aria-labelledby="upload-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 01</p><h2 id="upload-heading" className="mt-1 text-lg font-semibold">Sélectionner un document Word</h2></div>
            <span className="rounded-md border border-white/10 bg-[#141917] px-2.5 py-1.5 text-xs font-medium text-[#bac4be]">DOCX · PDF</span>
          </div>

          <input ref={inputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { selectWord(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" disabled={isProcessing} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectWord(event.dataTransfer.files[0]); }} className={`flex min-h-[150px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-wait ${isDragging ? 'border-[#71a9f7] bg-[#253348]' : 'border-[#46534b] bg-[#151a18] hover:border-[#7186a5] hover:bg-[#1c231f]'}`}>
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-[#253348] text-[#71a9f7]"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4v5.5h5.5M8 12h8m-8 3h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
            <span className="text-sm font-semibold">{isProcessing ? status : file ? 'Déposez un autre document ou cliquez pour remplacer' : 'Déposez votre document Word ici'}</span>
            <span className="mt-1 text-xs text-[#8e9b93]">ou cliquez pour sélectionner un fichier .docx</span>
          </button>

          {error && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{error}</p>}

          {file && <dl className="mt-5 grid gap-4 border-t border-white/[0.08] pt-4 sm:grid-cols-2">
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Document</dt><dd className="mt-1 truncate text-sm font-medium text-[#e7ebe8]" title={file.name}>{file.name}</dd></div>
            <div><dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#7e8b81]">Poids du fichier</dt><dd className="mt-1 text-sm font-medium text-[#e7ebe8]">{formatSize(file.size)}</dd></div>
          </dl>}
        </section>

        {file && <section className="mt-5 rounded-[10px] border border-white/10 bg-[#1a201e] p-5 sm:p-6" aria-labelledby="convert-heading">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 02</p><h2 id="convert-heading" className="mt-1 text-lg font-semibold">Générer votre PDF</h2><p className="mt-1 text-sm text-[#8e9b93]">Les titres, paragraphes, listes et tableaux sont conservés.</p></div>
            <button type="button" disabled={isProcessing} onClick={() => void convertToPdf()} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#d9f28b] px-5 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa] disabled:cursor-wait disabled:opacity-50">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Convertir en PDF
            </button>
          </div>

          {isProcessing && <div className="mt-5" role="status" aria-live="polite">
            <div className="mb-2 flex items-center gap-2 text-xs text-[#dce4dc]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#71a9f7]" />{status}</div>
            <div className="h-2 overflow-hidden rounded-full bg-[#111615]"><div className={`h-full rounded-full bg-[#71a9f7] transition-all duration-500 ${stage === 'reading' ? 'w-1/3' : 'w-4/5'}`} /></div>
          </div>}
        </section>}

        {result && <section className="mt-5 rounded-[10px] border border-[#496143]/50 bg-[#1b261d] p-5 sm:p-6" aria-labelledby="result-heading">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b9e38d]">Conversion terminée</p><h2 id="result-heading" className="mt-1 text-lg font-semibold">Votre fichier PDF est prêt.</h2><p className="mt-1 text-sm text-[#a2ada7]">{result.fileName}</p></div>
            <button type="button" onClick={() => void downloadAgain()} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#d9f28b] px-5 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa]">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Télécharger le fichier PDF
            </button>
          </div>
        </section>}
      </section>
    </main>
  );
}