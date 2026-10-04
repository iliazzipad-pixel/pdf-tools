'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Scissors, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

export default function SplitPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [pageRange, setPageRange] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setDownloadUrl(null);
      setError(null);

      try {
        const buffer = await selected.arrayBuffer();
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const count = doc.getPageCount();
        setTotalPages(count);
        setPageRange(`1-${count}`);
      } catch {
        setError('Impossible de lire le nombre de pages du document.');
      }
    }
  };

  const parseRanges = (str: string, max: number): number[] => {
    const pages = new Set<number>();
    const parts = str.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let page = Math.max(1, start); page <= Math.min(max, end); page++) {
            pages.add(page - 1);
          }
        }
      } else {
        const page = parseInt(trimmed, 10);
        if (!isNaN(page) && page >= 1 && page <= max) {
          pages.add(page - 1);
        }
      }
    }

    return Array.from(pages).sort((a, b) => a - b);
  };

  const handleSplitPdf = async () => {
    if (!file || !totalPages) return;
    setIsProcessing(true);
    setError(null);

    try {
      const selectedIndices = parseRanges(pageRange, totalPages);
      if (selectedIndices.length === 0) {
        throw new Error('Veuillez renseigner un intervalle de pages valide.');
      }

      const buffer = await file.arrayBuffer();
      const srcDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(srcDoc, selectedIndices);
      copiedPages.forEach((page) => newDoc.addPage(page));

      const pdfBytes = await newDoc.save();
      const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBuffer).set(pdfBytes);
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const baseName = file.name.replace(/\.[^/.]+$/, '');

      setOutputFileName(`${baseName}_extrait.pdf`);
      setDownloadUrl(url);
    } catch (conversionError) {
      console.error(conversionError);
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : 'Erreur lors de la découpe du PDF.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 p-6 md:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" />
          Retour à l&apos;accueil
        </Link>

        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Scissors className="w-8 h-8 text-indigo-400" />
            Diviser un PDF
          </h1>
          <p className="text-slate-400 mt-2">
            Extrayez des pages spécifiques ou un intervalle de votre document.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 cursor-pointer transition">
            <Scissors className="w-12 h-12 text-slate-500 mb-3" />
            <span className="text-sm font-medium text-slate-200">
              {file ? file.name : 'Déposez votre PDF ou cliquez pour parcourir'}
            </span>
            {totalPages && (
              <span className="text-xs text-indigo-400 mt-1">
                Document détecté : {totalPages} page{totalPages > 1 ? 's' : ''}
              </span>
            )}
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          </label>

          {file && !downloadUrl && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Pages à extraire (ex. : 1-3, 5)
                </label>
                <input
                  type="text"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  placeholder="Ex : 1-3 ou 2, 4"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={handleSplitPdf}
                disabled={isProcessing}
                className="w-full py-3.5 px-6 rounded-xl font-medium bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Découpage en cours...
                  </>
                ) : (
                  'Extraire les pages'
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-950/50 border border-red-800 rounded-xl text-red-300 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {downloadUrl && (
            <div className="p-6 bg-slate-800/60 border border-slate-700 rounded-xl space-y-4 text-center">
              <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-medium">
                <CheckCircle2 className="w-5 h-5" />
                Nouveau PDF prêt !
              </div>
              <a
                href={downloadUrl}
                download={outputFileName}
                className="inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition w-full"
              >
                <Download className="w-5 h-5" />
                Télécharger {outputFileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
