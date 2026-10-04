import type { Metadata } from 'next';
import { toolsSeo } from '@/config/seo';

export const metadata: Metadata = {
  title: toolsSeo.split.title,
  description: toolsSeo.split.description,
  keywords: toolsSeo.split.keywords,
  openGraph: {
    title: toolsSeo.split.title,
    description: toolsSeo.split.description,
    url: 'https://pdf-tools-plum.vercel.app/pdf/split',
  },
};

export default function SplitLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
