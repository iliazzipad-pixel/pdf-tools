import { NextRequest, NextResponse } from 'next/server';
// pdf2json exposes a CommonJS constructor.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json');

export async function POST(req: NextRequest) {
  try {
    const data = await req.formData();
    const file = data.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pdfParser = new PDFParser(null, 1);

    const text: string = await new Promise((resolve, reject) => {
      pdfParser.on('pdfParser_dataError', (errData: unknown) => {
        if (errData && typeof errData === 'object' && 'parserError' in errData) {
          reject(errData.parserError);
        } else {
          reject(errData);
        }
      });
      pdfParser.on('pdfParser_dataReady', () => {
        resolve(pdfParser.getRawTextContent());
      });
      pdfParser.parseBuffer(buffer);
    });

    if (!text || !text.trim()) {
      return NextResponse.json({ error: "Aucun texte n'a pu être extrait" }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (error) {
    console.error('Erreur API extract-pdf :', error);
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
