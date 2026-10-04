import type { Metadata } from 'next';
import { toolsSeo } from '@/config/seo';

export const metadata: Metadata = {
  title: toolsSeo.merge.title,
  description: toolsSeo.merge.description,
  keywords: toolsSeo.merge.keywords,
  openGraph: {
    title: toolsSeo.merge.title,
    description: toolsSeo.merge.description,
    url: 'https://pdf-tools-plum.vercel.app/pdf',
  },
};

export default function PdfLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
