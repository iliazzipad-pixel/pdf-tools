import type { Metadata } from 'next';
import { toolsSeo } from '@/config/seo';

export const metadata: Metadata = {
  title: toolsSeo.toExcel.title,
  description: toolsSeo.toExcel.description,
  keywords: toolsSeo.toExcel.keywords,
  openGraph: {
    title: toolsSeo.toExcel.title,
    description: toolsSeo.toExcel.description,
    url: 'https://pdf-tools-plum.vercel.app/pdf/to-excel',
  },
};

export default function PdfToExcelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
