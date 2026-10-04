import type { Metadata } from 'next';
import { toolsSeo } from '@/config/seo';

export const metadata: Metadata = {
  title: toolsSeo.imageCompress.title,
  description: toolsSeo.imageCompress.description,
  keywords: toolsSeo.imageCompress.keywords,
  openGraph: {
    title: toolsSeo.imageCompress.title,
    description: toolsSeo.imageCompress.description,
    url: 'https://pdf-tools-plum.vercel.app/image/compress',
  },
};

export default function ImageCompressLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
