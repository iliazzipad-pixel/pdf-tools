import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://pdf-tools-plum.vercel.app';

  const routes = [
    '',
    '/pdf/split',
    '/pdf/merge',
    '/pdf/compress',
    '/pdf/to-word',
    '/pdf/to-excel',
    '/pdf/sign',
    '/image/convert',
    '/image/compress',
    '/tools/image-to-prompt',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));
}
