import type { Metadata } from 'next';
import { toolsSeo } from '@/config/seo';

export const metadata: Metadata = {
  title: toolsSeo.sign.title,
  description: toolsSeo.sign.description,
  keywords: toolsSeo.sign.keywords,
  openGraph: {
    title: toolsSeo.sign.title,
    description: toolsSeo.sign.description,
    url: 'https://pdf-tools-plum.vercel.app/pdf/sign',
  },
};

export default function PdfSignLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
