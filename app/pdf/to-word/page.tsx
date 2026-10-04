'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Document, Paragraph, TextRun, Packer } from 'docx';

function sanitizeXml(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '');
}

export default function PdfToWordPage() {
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

  const convertPdfToWord = async () => {
    if (!file) return;
    setIsConverting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/extract-pdf', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur de lecture');
      if (!data.text?.trim()) {
        setError('Aucun texte n’a été extrait de ce document PDF.');
        return;
      }

      const lines = data.text
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith('----------------Page'));

      const paragraphs: Paragraph[] = lines.map((line: string) => {
        const clean = sanitizeXml(line);
        const isTitle =
          clean.toLowerCase().includes('mois') ||
          clean.toLowerCase().includes('semaine') ||
          clean.endsWith(':');

        return new Paragraph({
          children: [
            new TextRun({
              text: clean,
              bold: isTitle,
              size: isTitle ? 24 : 22,
              color: isTitle ? '1D4ED8' : '111827',
            }),
          ],
          spacing: { after: isTitle ? 140 : 100 },
        });
      });

      const doc = new Document({
        sections: [{ properties: {}, children: paragraphs }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const baseName = file.name.replace(/\.[^/.]+$/, '');

      setOutputFileName(`${baseName}.docx`);
      setDownloadUrl(url);
    } catch (conversionError) {
      console.error(conversionError);
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : 'Erreur pendant la conversion.',
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
            <FileText className="w-8 h-8 text-blue-500" />
            PDF en Word
          </h1>
          <p className="text-slate-400 mt-2">
            Convertissez vos documents PDF en fichiers Word éditables.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-8 cursor-pointer transition">
            <FileText className="w-12 h-12 text-slate-500 mb-3" />
            <span className="text-sm font-medium text-slate-200">
              {file ? file.name : 'Déposez votre fichier PDF ou cliquez pour parcourir'}
            </span>
            <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
          </label>

          {file && !downloadUrl && (
            <button
              onClick={convertPdfToWord}
              disabled={isConverting}
              className="w-full py-3.5 px-6 rounded-xl font-medium bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Conversion en cours...
                </>
              ) : (
                'Convertir en Word (.docx)'
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
                Document Word prêt !
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
