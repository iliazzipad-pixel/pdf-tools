'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

function sanitizeWinAnsi(str: string): string {
  return str.normalize('NFKD').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

export default function ExcelToPdfPage() {
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

  const convertExcelToPdf = async () => {
    if (!file) return;
    setIsConverting(true);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Le classeur Excel ne contient aucune feuille.');
      }

      const pdfDoc = await PDFDocument.create();
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pageWidth = 842;
      const pageHeight = 595;
      const margin = 40;
      const rowHeight = 22;

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
        if (!rows || rows.length === 0) continue;

        const maxCols = Math.min(
          8,
          Math.max(...rows.map((row) => (Array.isArray(row) ? row.length : 0))),
        );

        if (maxCols === 0) continue;

        const colWidth = (pageWidth - margin * 2) / maxCols;
        let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
        let currentY = pageHeight - margin;
        const cleanSheetName = sanitizeWinAnsi(sheetName);

        currentPage.drawText(`Feuille : ${cleanSheetName}`, {
          x: margin,
          y: currentY,
          size: 14,
          font: fontBold,
          color: rgb(0.08, 0.45, 0.25),
        });

        currentY -= 30;

        for (let rIndex = 0; rIndex < rows.length; rIndex++) {
          const row = rows[rIndex] || [];
          const isHeader = rIndex === 0;

          if (currentY < margin + rowHeight) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            currentY = pageHeight - margin - 20;
          }

          currentPage.drawLine({
            start: { x: margin, y: currentY - 4 },
            end: { x: pageWidth - margin, y: currentY - 4 },
            thickness: 0.5,
            color: isHeader ? rgb(0.2, 0.2, 0.2) : rgb(0.85, 0.85, 0.85),
          });

          for (let cIndex = 0; cIndex < maxCols; cIndex++) {
            const rawVal = row[cIndex] !== undefined && row[cIndex] !== null ? String(row[cIndex]) : '';
            const cellText = sanitizeWinAnsi(rawVal).slice(0, 24);

            if (cellText) {
              currentPage.drawText(cellText, {
                x: margin + cIndex * colWidth + 4,
                y: currentY + 2,
                size: isHeader ? 10 : 9,
                font: isHeader ? fontBold : fontRegular,
                color: isHeader ? rgb(0.1, 0.1, 0.1) : rgb(0.2, 0.2, 0.2),
              });
            }
          }

          currentY -= rowHeight;
        }
      }

      if (pdfDoc.getPageCount() === 0) {
        throw new Error('Aucune donnée valide trouvée dans le fichier.');
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
          : 'Erreur lors de la conversion du fichier Excel.',
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
            <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
            Excel en PDF
          </h1>
          <p className="text-slate-400 mt-2">
            Convertissez vos feuilles de calcul XLSX ou XLS en documents PDF paginés.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-8 cursor-pointer transition">
            <FileSpreadsheet className="w-12 h-12 text-slate-500 mb-3" />
            <span className="text-sm font-medium text-slate-200">
              {file ? file.name : 'Déposez votre fichier Excel (.xlsx, .xls) ou cliquez pour parcourir'}
            </span>
            <span className="text-xs text-slate-500 mt-1">XLSX, XLS ou CSV</span>
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileChange} />
          </label>

          {file && !downloadUrl && (
            <button
              onClick={convertExcelToPdf}
              disabled={isConverting}
              className="w-full py-3.5 px-6 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
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
                Document PDF généré !
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
