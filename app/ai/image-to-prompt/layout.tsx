import type { Metadata } from 'next';
import { toolsSeo } from '@/config/seo';

export const metadata: Metadata = {
  title: toolsSeo.imageToPrompt.title,
  description: toolsSeo.imageToPrompt.description,
  keywords: toolsSeo.imageToPrompt.keywords,
  openGraph: {
    title: toolsSeo.imageToPrompt.title,
    description: toolsSeo.imageToPrompt.description,
    url: 'https://pdf-tools-plum.vercel.app/ai/image-to-prompt',
  },
};

export default function ImageToPromptLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
