'use client';

import { PDFDocument } from 'pdf-lib';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type PdfJsViewport = { width: number; height: number };
type PdfJsRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfJsPage = {
  getViewport: (options: { scale: number }) => PdfJsViewport;
  render: (options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport; background: string }) => PdfJsRenderTask;
};
type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy: () => Promise<void>;
};
type PdfJsLibrary = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> };
};

const PDFJS_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const SIGNATURE_WIDTH = 720;
const SIGNATURE_HEIGHT = 220;
let pdfJsScriptPromise: Promise<void> | null = null;

type SignatureColor = 'black' | 'navy';
type SignatureMode = 'draw' | 'text' | 'import';
type Placement = { x: number; y: number; width: number };
type DragAction = {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  mode: 'move' | 'resize';
};

function loadPdfJsScript(): Promise<void> {
  if (window.pdfjsLib) {
    (window.pdfjsLib as PdfJsLibrary).GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
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
      (window.pdfjsLib as PdfJsLibrary).GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
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

function signatureHeightRatio(width: number, pageWidth: number, pageHeight: number) {
  return width * (pageWidth / pageHeight) * (SIGNATURE_HEIGHT / SIGNATURE_WIDTH);
}

export default function SignPdfPage() {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pdfDocumentRef = useRef<PdfJsDocument | null>(null);
  const dragActionRef = useRef<DragAction | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [placements, setPlacements] = useState<Record<number, Placement>>({});
  const [signatureColor, setSignatureColor] = useState<SignatureColor>('black');
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('draw');
  const [typedName, setTypedName] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [signaturePng, setSignaturePng] = useState('');
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => () => {
    if (pdfDocumentRef.current) void pdfDocumentRef.current.destroy();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let renderTask: PdfJsRenderTask | undefined;

    async function renderActivePage() {
      const pdf = pdfDocumentRef.current;
      const canvas = pageCanvasRef.current;
      if (!pdf || !canvas) return;

      setIsRendering(true);
      setError('');
      try {
        const page = await pdf.getPage(activePage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1.5 });
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas indisponible.');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        setPageSize({ width: viewport.width, height: viewport.height });
        renderTask = page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' });
        await renderTask.promise;
      } catch (renderError) {
        if (!cancelled) {
          console.error('Impossible de prévisualiser cette page PDF :', renderError);
          setError('Impossible d’afficher cette page du PDF.');
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    void renderActivePage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [activePage, pageCount]);

  function renderTypedName(name: string, color: SignatureColor) {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setHasSignature(false);
      return;
    }
    context.fillStyle = color === 'black' ? '#111111' : '#172d62';
    context.font = 'italic 76px cursive';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(trimmedName, canvas.width / 2, canvas.height / 2, canvas.width - 40);
    setHasSignature(true);
  }

  function changeSignatureMode(mode: SignatureMode) {
    setSignatureMode(mode);
    if (mode === 'text') renderTypedName(typedName, signatureColor);
  }

  function changeSignatureColor(color: SignatureColor) {
    setSignatureColor(color);
    if (signatureMode === 'text') renderTypedName(typedName, color);
  }

  async function selectPdf(selectedFile?: File) {
    if (!selectedFile) return;
    if (!isPdf(selectedFile)) {
      setError('Sélectionnez un fichier PDF valide.');
      return;
    }

    setError('');
    setMessage('');
    setIsLoading(true);
    setFile(selectedFile);
    setPageCount(0);
    setActivePage(1);
    setPageSize({ width: 0, height: 0 });
    setPlacements({});
    if (pdfDocumentRef.current) {
      await pdfDocumentRef.current.destroy();
      pdfDocumentRef.current = null;
    }

    try {
      await loadPdfJsScript();
      const pdfjs = window.pdfjsLib as PdfJsLibrary;
      const pdf = await pdfjs.getDocument({ data: await selectedFile.arrayBuffer() }).promise;
      pdfDocumentRef.current = pdf;
      setPageCount(pdf.numPages);
    } catch (loadError) {
      console.error('Impossible de charger le PDF :', loadError);
      setFile(null);
      setError('Impossible de lire ce PDF. Il est peut-être protégé ou endommagé.');
    } finally {
      setIsLoading(false);
    }
  }

  function signatureContext() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return null;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 7;
    context.strokeStyle = signatureColor === 'black' ? '#111111' : '#172d62';
    return { canvas, context };
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (signatureMode !== 'draw') return;
    event.preventDefault();
    const drawing = signatureContext();
    if (!drawing) return;
    const bounds = drawing.canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * drawing.canvas.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * drawing.canvas.height;
    drawing.canvas.setPointerCapture(event.pointerId);
    drawing.context.beginPath();
    drawing.context.moveTo(x, y);
    drawing.context.lineTo(x + 0.1, y + 0.1);
    drawing.context.stroke();
    setHasSignature(true);
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (signatureMode !== 'draw' || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const drawing = signatureContext();
    if (!drawing) return;
    const bounds = drawing.canvas.getBoundingClientRect();
    drawing.context.lineTo(
      ((event.clientX - bounds.left) / bounds.width) * drawing.canvas.width,
      ((event.clientY - bounds.top) / bounds.height) * drawing.canvas.height,
    );
    drawing.context.stroke();
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setSignaturePng('');
  }

  function importSignature(selectedImage?: File) {
    if (!selectedImage) return;
    if (selectedImage.type !== 'image/png') {
      setError('Importez une image PNG pour conserver la transparence.');
      return;
    }
    const image = new window.Image();
    image.onload = () => {
      const canvas = signatureCanvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min((canvas.width - 24) / image.width, (canvas.height - 24) / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      setSignatureMode('import');
      setHasSignature(true);
      setError('');
    };
    image.onerror = () => setError('Impossible de lire cette image PNG.');
    image.src = URL.createObjectURL(selectedImage);
    image.addEventListener('load', () => URL.revokeObjectURL(image.src), { once: true });
  }

  function commitSignature() {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !hasSignature || pageCount === 0) return;
    const png = canvas.toDataURL('image/png');
    setSignaturePng(png);
    setPlacements((current) => ({
      ...current,
      [activePage]: current[activePage] ?? { x: 0.58, y: 0.78, width: 0.32 },
    }));
    setMessage(`Signature ajoutée à la page ${activePage}. Déplacez-la pour ajuster sa position.`);
  }

  function beginPlacementAction(event: ReactPointerEvent<HTMLElement>, mode: DragAction['mode']) {
    event.preventDefault();
    event.stopPropagation();
    const placement = placements[activePage];
    if (!placement || !stageRef.current) return;
    dragActionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      mode,
    };
    stageRef.current.setPointerCapture(event.pointerId);
  }

  function updatePlacement(event: ReactPointerEvent<HTMLDivElement>) {
    const action = dragActionRef.current;
    const stage = stageRef.current;
    if (!action || !stage || action.pointerId !== event.pointerId) return;
    const bounds = stage.getBoundingClientRect();
    const pageHeightRatio = signatureHeightRatio(1, pageSize.width, pageSize.height);
    const deltaX = (event.clientX - action.startX) / bounds.width;
    const deltaY = (event.clientY - action.startY) / bounds.height;
    const width = action.mode === 'resize'
      ? Math.min(0.65, Math.max(0.12, action.width + deltaX))
      : action.width;
    const height = width * pageHeightRatio;
    const x = action.mode === 'move' ? action.x + deltaX : action.x;
    const y = action.mode === 'move' ? action.y + deltaY : action.y;
    setPlacements((current) => ({
      ...current,
      [activePage]: {
        x: Math.min(Math.max(0, x), 1 - width),
        y: Math.min(Math.max(0, y), 1 - height),
        width,
      },
    }));
  }

  function endPlacementAction(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragActionRef.current?.pointerId !== event.pointerId) return;
    dragActionRef.current = null;
    if (stageRef.current?.hasPointerCapture(event.pointerId)) stageRef.current.releasePointerCapture(event.pointerId);
  }

  async function applySignature() {
    if (!file || !signaturePng || Object.keys(placements).length === 0 || isApplying) return;
    setIsApplying(true);
    setError('');
    setMessage('');
    try {
      const pdf = await PDFDocument.load(await file.arrayBuffer());
      const signatureBytes = Uint8Array.from(atob(signaturePng.split(',')[1]), (character) => character.charCodeAt(0));
      const embeddedSignature = await pdf.embedPng(signatureBytes);

      for (const [pageNumber, placement] of Object.entries(placements)) {
        const page = pdf.getPage(Number(pageNumber) - 1);
        const { width: pageWidth, height: pageHeight } = page.getSize();
        const width = placement.width * pageWidth;
        const height = width * (SIGNATURE_HEIGHT / SIGNATURE_WIDTH);
        page.drawImage(embeddedSignature, {
          x: placement.x * pageWidth,
          y: pageHeight - (placement.y * pageHeight) - height,
          width,
          height,
        });
      }

      const bytes = await pdf.save();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${file.name.replace(/\.pdf$/i, '')}-signe.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Le PDF signé a été téléchargé.');
    } catch (signError) {
      console.error('Impossible d’appliquer la signature au PDF :', signError);
      setError('La signature n’a pas pu être appliquée. Vérifiez que le PDF est lisible et non protégé.');
    } finally {
      setIsApplying(false);
    }
  }

  const currentPlacement = placements[activePage];
  const currentSignatureHeight = currentPlacement && pageSize.width && pageSize.height
    ? signatureHeightRatio(currentPlacement.width, pageSize.width, pageSize.height)
    : 0;

  return (
    <main className="min-h-screen bg-[#111615] text-[#f4f6f3]">
      <header className="border-b border-white/10 bg-[#151b19]">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#3b2928] text-[#f18d7e]" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" className="h-5 w-5"><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" stroke="currentColor" strokeWidth="1.6" /><path d="M8 16c1.2-2.6 2.2 1.7 3.3-.6 1-2.1 1.5 2.4 4.7-.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span>
            <span className="text-[17px] font-semibold tracking-[-0.02em]">PixelPress</span>
          </Link>
          <nav aria-label="Navigation principale" className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#101413] p-1 text-sm">
            <Link href="/" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Accueil</Link>
            <Link href="/pdf" className="rounded-md px-3 py-2 text-[#a0aca5] transition hover:bg-white/5 hover:text-white">Outils PDF</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-9 sm:px-8 sm:pt-12">
        <div className="mb-7 max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#f18d7e]">Signature PDF</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-[42px]">Signez votre document.</h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-[#a2ada7]">Créez ou importez votre signature, placez-la sur les pages voulues et téléchargez votre PDF. Tout reste dans votre navigateur.</p>
        </div>

        <section className="mb-6 rounded-[10px] border border-white/10 bg-[#1a201e] p-5 sm:p-6" aria-labelledby="pdf-upload-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 01</p><h2 id="pdf-upload-heading" className="mt-1 text-lg font-semibold">Votre document PDF</h2></div>
            {file && <span className="max-w-full truncate text-sm text-[#aab5ad]" title={file.name}>{file.name}</span>}
          </div>
          <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(event) => { void selectPdf(event.target.files?.[0]); event.target.value = ''; }} />
          <button type="button" disabled={isLoading} onClick={() => pdfInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDraggingPdf(true); }} onDragLeave={() => setIsDraggingPdf(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingPdf(false); void selectPdf(event.dataTransfer.files[0]); }} className={`flex min-h-[118px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-wait ${isDraggingPdf ? 'border-[#f18d7e] bg-[#332523]' : 'border-[#46534b] bg-[#151a18] hover:border-[#a77870] hover:bg-[#1c231f]'}`}>
            <span className="text-sm font-semibold">{isLoading ? 'Chargement du document…' : file ? 'Déposez un autre PDF ou cliquez pour remplacer' : 'Déposez un PDF ici ou cliquez pour sélectionner'}</span>
            <span className="mt-1 text-xs text-[#8e9b93]">Un seul fichier PDF</span>
          </button>
          {error && <p role="alert" className="mt-3 rounded-md border border-[#693a35] bg-[#321f1d] px-3 py-2.5 text-xs text-[#f3a294]">{error}</p>}
          {message && <p role="status" className="mt-3 text-sm text-[#b9e38d]">{message}</p>}
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
          <section className="min-w-0 rounded-[10px] border border-white/10 bg-[#1a201e] p-4 sm:p-5" aria-labelledby="preview-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 02</p><h2 id="preview-heading" className="mt-1 text-lg font-semibold">Aperçu du document</h2></div>
              {pageCount > 0 && <div className="flex items-center gap-2">
                <button type="button" disabled={activePage <= 1 || isRendering} onClick={() => setActivePage((page) => Math.max(1, page - 1))} aria-label="Page précédente" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-[#c2ccc5] transition hover:bg-white/[0.06] disabled:opacity-35">←</button>
                <span className="min-w-[88px] text-center text-xs tabular-nums text-[#aab5ad]">Page {activePage} / {pageCount}</span>
                <button type="button" disabled={activePage >= pageCount || isRendering} onClick={() => setActivePage((page) => Math.min(pageCount, page + 1))} aria-label="Page suivante" className="grid h-9 w-9 place-items-center rounded-md border border-white/10 text-[#c2ccc5] transition hover:bg-white/[0.06] disabled:opacity-35">→</button>
              </div>}
            </div>

            {pageCount > 0 ? (
              <div ref={stageRef} data-pdf-stage="true" onPointerMove={updatePlacement} onPointerUp={endPlacementAction} onPointerCancel={endPlacementAction} className="relative mx-auto w-full max-w-[900px] touch-none overflow-hidden bg-white shadow-[0_10px_30px_rgba(0,0,0,0.25)]" style={{ aspectRatio: pageSize.width > 0 ? `${pageSize.width} / ${pageSize.height}` : '612 / 792' }}>
                <canvas ref={pageCanvasRef} aria-label={`Aperçu de la page ${activePage}`} className="absolute inset-0 block h-full w-full" />
                {currentPlacement && signaturePng && <div onPointerDown={(event) => beginPlacementAction(event, 'move')} role="group" aria-label={`Signature sur la page ${activePage}, déplaçable`} className="absolute z-10 cursor-move border border-dashed border-[#4383dc] bg-[#4383dc]/10" style={{ left: `${currentPlacement.x * 100}%`, top: `${currentPlacement.y * 100}%`, width: `${currentPlacement.width * 100}%`, height: `${currentSignatureHeight * 100}%` }}>
                  <Image src={signaturePng} alt="Signature à placer" draggable={false} fill unoptimized className="pointer-events-none object-contain" sizes="(max-width: 1280px) 30vw, 25vw" />
                  <button type="button" onPointerDown={(event) => beginPlacementAction(event, 'resize')} aria-label="Redimensionner la signature" title="Redimensionner" className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize rounded-sm border border-white bg-[#4383dc] shadow" />
                </div>}
                {isRendering && <div className="absolute inset-0 grid place-items-center bg-white/75 text-sm font-medium text-[#344039]">Rendu de la page…</div>}
              </div>
            ) : (
              <div className="grid min-h-[280px] place-items-center rounded-lg border border-white/[0.07] bg-[#151a18] px-5 text-center text-sm text-[#87948c]">La prévisualisation des pages apparaîtra ici après le chargement du PDF.</div>
            )}
          </section>

          <section className="rounded-[10px] border border-white/10 bg-[#1a201e] p-5 sm:p-6" aria-labelledby="signature-heading">
            <div className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#839188]">Étape 03</p><h2 id="signature-heading" className="mt-1 text-lg font-semibold">Créer une signature</h2></div>
            <div role="tablist" aria-label="Mode de création de signature" className="mb-4 grid grid-cols-3 rounded-md border border-white/10 bg-[#141917] p-1">
              {([{ id: 'draw', label: 'Dessiner' }, { id: 'text', label: 'Texte' }, { id: 'import', label: 'Importer' }] as const).map((mode) => <button key={mode.id} type="button" role="tab" aria-selected={signatureMode === mode.id} onClick={() => changeSignatureMode(mode.id)} className={`min-h-9 rounded px-2 text-xs font-medium transition ${signatureMode === mode.id ? 'bg-[#293a32] text-[#d7f36a]' : 'text-[#a0aca5] hover:text-white'}`}>{mode.label}</button>)}
            </div>

            {signatureMode === 'text' && <label className="mb-3 block text-xs font-medium text-[#a8b2ab]">Votre nom<input value={typedName} onChange={(event) => { setTypedName(event.target.value); renderTypedName(event.target.value, signatureColor); }} maxLength={48} placeholder="Ex. Camille Martin" className="mt-2 h-10 w-full rounded-md border border-white/10 bg-[#141917] px-3 text-sm text-white outline-none placeholder:text-[#647168] focus:border-[#91b96c]" /></label>}
            {signatureMode === 'import' && <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-white/10 bg-[#141917] px-3 py-2.5"><span className="text-xs text-[#a8b2ab]">Image PNG transparente</span><input ref={imageInputRef} type="file" accept="image/png,.png" className="sr-only" onChange={(event) => { importSignature(event.target.files?.[0]); event.target.value = ''; }} /><button type="button" onClick={() => imageInputRef.current?.click()} className="rounded border border-white/10 px-3 py-2 text-xs font-semibold text-[#dce4dc] hover:bg-white/[0.06]">Choisir une image</button></div>}

            <div className="overflow-hidden rounded-md border border-white/10 bg-white">
              <canvas ref={signatureCanvasRef} width={SIGNATURE_WIDTH} height={SIGNATURE_HEIGHT} aria-label="Zone de signature" onPointerDown={startDrawing} onPointerMove={continueDrawing} className={`${signatureMode === 'draw' ? 'cursor-crosshair touch-none' : 'pointer-events-none'} block h-auto w-full`} />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2" aria-label="Couleur de la signature">
                <button type="button" aria-pressed={signatureColor === 'black'} onClick={() => changeSignatureColor('black')} className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs ${signatureColor === 'black' ? 'border-[#91b96c] bg-[#253126] text-white' : 'border-white/10 text-[#aab5ad]'}`}><span className="h-3 w-3 rounded-full border border-white/25 bg-[#111111]" />Noir</button>
                <button type="button" aria-pressed={signatureColor === 'navy'} onClick={() => changeSignatureColor('navy')} className={`inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs ${signatureColor === 'navy' ? 'border-[#91b96c] bg-[#253126] text-white' : 'border-white/10 text-[#aab5ad]'}`}><span className="h-3 w-3 rounded-full border border-white/25 bg-[#172d62]" />Bleu foncé</button>
              </div>
              <button type="button" onClick={clearSignature} className="h-8 rounded border border-white/10 px-2.5 text-xs font-medium text-[#aab5ad] hover:bg-white/[0.06] hover:text-white">Effacer</button>
            </div>
            <button type="button" onClick={commitSignature} disabled={!hasSignature || pageCount === 0 || isLoading} className="mt-4 h-10 w-full rounded-md bg-[#d9f28b] px-4 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa] disabled:cursor-not-allowed disabled:opacity-40">Utiliser cette signature</button>
            <p className="mt-2 text-center text-[11px] leading-5 text-[#7e8b81]">Dessinez avec la souris ou le doigt. Vous pouvez aussi saisir un nom ou importer un PNG.</p>
          </section>
        </div>

        {pageCount > 0 && <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-[10px] border border-white/10 bg-[#1a201e] p-4 sm:flex-row sm:items-center sm:px-5">
          <p className="text-sm text-[#a2ada7]">{Object.keys(placements).length > 0 ? `${Object.keys(placements).length} page${Object.keys(placements).length > 1 ? 's' : ''} avec signature prête${Object.keys(placements).length > 1 ? 's' : ''}.` : 'Ajoutez une signature à l’aperçu pour continuer.'}</p>
          <button type="button" onClick={() => void applySignature()} disabled={Object.keys(placements).length === 0 || !signaturePng || isApplying} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#d9f28b] px-5 text-sm font-semibold text-[#20291d] transition hover:bg-[#e6f8aa] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 2.75v9m0 0 3.25-3.25M10 11.75 6.75 8.5M3.5 13.25v2A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {isApplying ? 'Application en cours…' : 'Appliquer et télécharger le PDF signé'}
          </button>
        </div>}
      </section>
    </main>
  );
}