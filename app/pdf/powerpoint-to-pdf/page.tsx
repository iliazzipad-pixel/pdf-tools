'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Presentation, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function sanitizeWinAnsi(str: string): string {
  const normalized = str.normalize('NFKD');
  return normalized.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

export default function PptxToPdfPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setDownloadUrl(null);
      setError(null);
    }
  };

  const convertPptxToPdf = async () => {
    if (!file) return;
    setIsConverting(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const slideFiles = Object.keys(zip.files).filter((name) =>
        name.match(/^ppt\/slides\/slide[0-9]+\.xml$/),
      );

      slideFiles.sort((a, b) => {
        const numA = parseInt(a.match(/slide([0-9]+)\.xml/)![1], 10);
        const numB = parseInt(b.match(/slide([0-9]+)\.xml/)![1], 10);
        return numA - numB;
      });

      if (slideFiles.length === 0) {
        throw new Error('Aucune diapositive trouvée dans cette présentation.');
      }

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pageWidth = 842;
      const pageHeight = 595;

      for (let i = 0; i < slideFiles.length; i++) {
        const slideXml = await zip.files[slideFiles[i]].async('text');
        const textMatches = Array.from(slideXml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map(
          (match) => match[1],
        );
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        page.drawText(sanitizeWinAnsi(`Diapositive ${i + 1}`), {
          x: 40,
          y: pageHeight - 40,
          size: 14,
          font: fontBold,
          color: rgb(0.85, 0.45, 0.1),
        });

        let yOffset = pageHeight - 80;
        for (const rawText of textMatches) {
          const cleanText = rawText.trim();
          if (!cleanText) continue;
          const safeText = sanitizeWinAnsi(cleanText).slice(0, 95);
          if (!safeText.trim()) continue;

          page.drawText(safeText, {
            x: 50,
            y: yOffset,
            size: 12,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });

          yOffset -= 24;
          if (yOffset < 50) break;
        }
      }

      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBuffer).set(pdfBytes);
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const baseName = file.name.replace(/\.[^/.]+$/, '');

      setOutputFileName(`${baseName}.pdf`);
      setDownloadUrl(url);
    } catch (conversionError) {
      console.error(conversionError);
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : 'Erreur lors de la conversion.',
      );
    } finally {
      setIsConverting(false);
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
            <Presentation className="w-8 h-8 text-amber-500" />
            PowerPoint en PDF
          </h1>
          <p className="text-slate-400 mt-2">
            Convertissez vos présentations PPTX en documents PDF prêts à imprimer ou partager.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-xl p-8 cursor-pointer transition">
            <Presentation className="w-12 h-12 text-slate-500 mb-3" />
            <span className="text-sm font-medium text-slate-200">
              {file ? file.name : 'Déposez votre fichier PowerPoint (.pptx) ou cliquez pour parcourir'}
            </span>
            <span className="text-xs text-slate-500 mt-1">PPTX uniquement</span>
            <input type="file" accept=".pptx" className="hidden" onChange={handleFileChange} />
          </label>

          {file && !downloadUrl && (
            <button
              onClick={convertPptxToPdf}
              disabled={isConverting}
              className="w-full py-3.5 px-6 rounded-xl font-medium bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Conversion en cours...
                </>
              ) : (
                'Convertir en PDF'
              )}
            </button>
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
                Fichier PDF généré avec succès !
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
