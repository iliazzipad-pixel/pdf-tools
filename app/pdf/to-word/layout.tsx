import type { Metadata } from 'next';
import { toolsSeo } from '@/config/seo';

export const metadata: Metadata = {
  title: toolsSeo.toWord.title,
  description: toolsSeo.toWord.description,
  keywords: toolsSeo.toWord.keywords,
  openGraph: {
    title: toolsSeo.toWord.title,
    description: toolsSeo.toWord.description,
    url: 'https://pdf-tools-plum.vercel.app/pdf/to-word',
  },
};

export default function PdfToWordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
