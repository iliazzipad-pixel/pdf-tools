'use client';

import Link from 'next/link';
import { useState } from 'react';

type ToolCategory = 'Images' | 'PDF' | 'Intelligence Artificielle';
type Tool = {
  title: string;
  description: string;
  category: ToolCategory;
  href?: string;
  status: 'Actif' | 'IA / Nouveau' | 'Bientôt' | 'Pro / Bientôt';
  icon: 'image' | 'merge' | 'compress' | 'convert' | 'ai' | 'resize' | 'pdf' | 'signature' | 'word' | 'powerpoint' | 'excel';
  color: string;
  tint: string;
};

const filters = ['Tous', 'Images', 'PDF', 'Intelligence Artificielle'] as const;
type Filter = (typeof filters)[number];

const tools: Tool[] = [
  { title: 'Compresser une image', description: 'Réduisez le poids de vos images sans effort.', category: 'Images', href: '/image/compress', status: 'Actif', icon: 'image', color: '#a7df75', tint: '#263829' },
  { title: 'Fusionner des PDF', description: 'Réunissez plusieurs documents en un seul fichier.', category: 'PDF', href: '/pdf', status: 'Actif', icon: 'merge', color: '#f18d7e', tint: '#3b2928' },
  { title: 'Compresser un PDF', description: 'Allégez vos PDF et choisissez votre niveau de qualité.', category: 'PDF', href: '/pdf', status: 'Actif', icon: 'compress', color: '#8ab8f0', tint: '#253348' },
  { title: 'PDF en JPG', description: 'Convertissez chaque page de votre PDF en image JPEG.', category: 'PDF', href: '/pdf/to-jpg', status: 'Actif', icon: 'pdf', color: '#f18d7e', tint: '#3b2928' },
  { title: 'JPG en PDF', description: 'Convertissez vos JPG et autres images en document PDF.', category: 'Images', href: '/image/to-pdf', status: 'Actif', icon: 'convert', color: '#ebbf70', tint: '#3a3224' },
  { title: 'Signer PDF', description: 'Ajoutez une signature à vos documents PDF.', category: 'PDF', href: '/pdf/sign', status: 'Actif', icon: 'signature', color: '#f18d7e', tint: '#3b2928' },
  { title: 'PDF en Word', description: 'Convertissez vos documents PDF en fichiers Word.', category: 'PDF', href: '/pdf/to-word', status: 'Actif', icon: 'word', color: '#71a9f7', tint: '#253348' },
  { title: 'PDF en PowerPoint', description: 'Transformez vos PDF en présentations PowerPoint.', category: 'PDF', href: '/pdf/to-powerpoint', status: 'Actif', icon: 'powerpoint', color: '#f29b62', tint: '#3a2c24' },
  { title: 'PDF en Excel', description: 'Récupérez les tableaux de vos PDF dans Excel.', category: 'PDF', href: '/pdf/to-excel', status: 'Actif', icon: 'excel', color: '#68c785', tint: '#23382b' },
  { title: 'Word en PDF', description: 'Convertissez vos documents Word au format PDF.', category: 'PDF', href: '/word/to-pdf', status: 'Actif', icon: 'word', color: '#71a9f7', tint: '#253348' },
  { title: 'PowerPoint en PDF', description: 'Exportez vos présentations au format PDF.', category: 'PDF', href: '/pdf/powerpoint-to-pdf', status: 'Actif', icon: 'powerpoint', color: '#f29b62', tint: '#3a2c24' },
  { title: 'Excel en PDF', description: 'Convertissez vos feuilles Excel au format PDF.', category: 'PDF', href: '/pdf/excel-to-pdf', status: 'Actif', icon: 'excel', color: '#68c785', tint: '#23382b' },
  { title: 'Image to Prompt', description: 'Extrayez le prompt exact et le style artistique de n’importe quelle image.', category: 'Intelligence Artificielle', href: '/ai/image-to-prompt', status: 'IA / Nouveau', icon: 'ai', color: '#d8a8f0', tint: '#35283d' },
  { title: 'Redimensionner une image', description: 'Adaptez les dimensions à chaque usage.', category: 'Images', href: '/image/resize', status: 'Actif', icon: 'resize', color: '#79d3cb', tint: '#203734' },
];

function ToolIcon({ name }: { name: Tool['icon'] }) {
  const paths: Record<Tool['icon'], React.ReactNode> = {
    image: <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.5" /><path d="m5 17 4.5-4.5 3 3L15 13l4 4" /></>,
    merge: <><path d="M7 4v5a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3v5" /><path d="m13.5 17 3.5 3 3.5-3M17 4v3" /><path d="M4 4h6M4 20h6" /></>,
    compress: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" /><path d="m9 9-6-6m0 6V3h6m6 6 6-6m0 6V3h-6M9 15l-6 6m0-6v6h6m6-6 6 6m0-6v6h-6" /></>,
    convert: <><rect x="3.5" y="3" width="10" height="13" rx="1.5" /><path d="M7 7h3m-3 3h3m-3 3h3" /><path d="M13.5 8H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-2" /><path d="m15 12 2 2 2-2" /></>,
    ai: <><path d="M12 3.5 14.2 9l5.3 2-5.3 2.1L12 18.5l-2.1-5.4L4.5 11l5.4-2 2.1-5.5Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15ZM5 3l.7 1.7L7.5 5.5l-1.8.7L5 8l-.7-1.8L2.5 5.5l1.8-.8L5 3Z" /></>,
    resize: <><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 3H3v6m12 12h6v-6M3 9l6-6m12 12-6 6" /></>,
    pdf: <><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" /><path d="M13 4v5.5h5.5" /><text x="7" y="16.3" fill="#ffd166" stroke="none" fontSize="5.2" fontWeight="700">PDF</text></>,
    signature: <><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" /><path d="M13 4v5.5h5.5M8 16c1.2-2.6 2.2 1.7 3.3-.6 1-2.1 1.5 2.4 4.7-.1" /></>,
    word: <><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" /><path d="M13 4v5.5h5.5" /><text x="8" y="16.4" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">W</text></>,
    powerpoint: <><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" /><path d="M13 4v5.5h5.5" /><text x="8" y="16.4" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">P</text></>,
    excel: <><path d="M13.5 3.5H6.75A1.75 1.75 0 0 0 5 5.25v13.5A1.75 1.75 0 0 0 6.75 20.5h10.5A1.75 1.75 0 0 0 19 18.75v-9L13.5 3.5Z" /><path d="M13 4v5.5h5.5" /><text x="8" y="16.4" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">X</text></>,
  };

  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">{paths[name]}</svg>;
}

function BrandMark() {
  return <span className="grid h-9 w-9 place-items-center rounded-[10px] border border-[#728c57]/35 bg-[#28392a] text-[#bbec85]"><ToolIcon name="image" /></span>;
}

export default function Home() {
  const [activeFilter, setActiveFilter] = useState<Filter>('Tous');
  const visibleTools = activeFilter === 'Tous' ? tools : tools.filter((tool) => tool.category === activeFilter);

  return (
    <main className="min-h-screen overflow-hidden bg-[#101412] text-[#f3f5f0]">
      <header className="relative z-10 border-b border-white/[0.08] bg-[#141916]">
        <div className="mx-auto flex min-h-[76px] max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="PixelPress, accueil">
            <BrandMark />
            <span className="text-[18px] font-semibold tracking-[-0.02em]">Pixel<span className="text-[#bbec85]">Press</span></span>
          </Link>
          <nav aria-label="Navigation principale" className="order-3 flex w-full items-center gap-6 overflow-x-auto text-sm text-[#a7b0aa] sm:order-none sm:ml-auto sm:w-auto">
            <a href="#outils" className="whitespace-nowrap transition hover:text-white">Tous les outils</a>
            <button type="button" onClick={() => setActiveFilter('Images')} className="whitespace-nowrap transition hover:text-white">Images</button>
            <button type="button" onClick={() => setActiveFilter('PDF')} className="whitespace-nowrap transition hover:text-white">PDF</button>
            <button type="button" onClick={() => setActiveFilter('Intelligence Artificielle')} className="whitespace-nowrap transition hover:text-white">IA</button>
          </nav>
        </div>
      </header>

      <section className="relative border-b border-white/[0.07] bg-[#171d19]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{ backgroundImage: 'linear-gradient(rgba(190,220,170,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(190,220,170,.12) 1px, transparent 1px)', backgroundSize: '52px 52px', maskImage: 'linear-gradient(to bottom, black, transparent 90%)' }} />
        <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-14 text-center sm:px-8 sm:pb-16 sm:pt-[76px]">
          <p className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a9cc83]"><span className="h-1.5 w-1.5 rounded-full bg-[#a9cc83]" />L’atelier média tout-en-un</p>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-[56px]">Tous les outils médias et PDF,<br className="hidden sm:block" /> au même endroit.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-[#a4afa7] sm:text-base">Compressez, convertissez et préparez vos fichiers avec des outils rapides, simples et privés. Tout se passe directement dans votre navigateur.</p>
          <a href="#outils" className="mt-7 inline-flex h-11 items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-[#e5ebe4] transition hover:border-[#a9cc83]/50 hover:bg-white/[0.08]">Explorer les outils <span aria-hidden="true">↓</span></a>
        </div>
      </section>

      <section id="outils" className="mx-auto max-w-7xl px-5 pb-16 pt-9 sm:px-8 sm:pt-11">
        <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#94a38f]">La boîte à outils</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em]">Que souhaitez-vous faire ?</h2>
          </div>
          <div role="tablist" aria-label="Filtrer les outils" className="flex max-w-full gap-2 overflow-x-auto pb-1">
            {filters.map((filter) => {
              const selected = activeFilter === filter;
              return <button key={filter} type="button" role="tab" aria-selected={selected} onClick={() => setActiveFilter(filter)} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium transition-colors ${selected ? 'border-[#d9f28b] bg-[#d9f28b] text-[#20291d]' : 'border-white/10 bg-[#171c19] text-[#aab4ac] hover:border-white/25 hover:text-white'}`}>{filter}</button>;
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTools.map((tool, index) => {
            const cardContent = (
              <>
                <div className="flex items-start justify-between gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[11px] border border-white/[0.07]" style={{ color: tool.color, backgroundColor: tool.tint }}><ToolIcon name={tool.icon} /></span>
                  <span className={`mt-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tool.status === 'Actif' ? 'border-[#5c7449]/45 bg-[#253123] text-[#b9e38d]' : tool.status === 'IA / Nouveau' || tool.status === 'Pro / Bientôt' ? 'border-[#765d88]/40 bg-[#30243a] text-[#d9b7f0]' : 'border-white/10 bg-white/[0.04] text-[#9ba69e]'}`}>{tool.status}</span>
                </div>
                <div className="mt-6">
                  <h3 className="text-[17px] font-semibold tracking-[-0.015em]">{tool.title}</h3>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-[#9da8a0]">{tool.description}</p>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-white/[0.08] pt-3.5 text-xs">
                  <span className="text-[#7e8b81]">{tool.category}</span>
                  {tool.href ? <span className="inline-flex items-center gap-1.5 font-semibold text-[#d9f28b]">Ouvrir <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span></span> : <span className="text-[#7e8b81]">En préparation</span>}
                </div>
              </>
            );
            const className = `group flex min-h-[230px] flex-col rounded-[9px] border border-white/[0.09] bg-[#191f1b] p-5 transition duration-200 ${tool.href ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#80936e]/55 hover:bg-[#1e2620] hover:shadow-[0_14px_36px_rgba(0,0,0,0.2)]' : 'hover:border-white/[0.15]'}`;
            return tool.href ? <Link key={tool.title} href={tool.href} className={className} style={{ animationDelay: `${index * 45}ms` }}>{cardContent}</Link> : <article key={tool.title} className={className} style={{ animationDelay: `${index * 45}ms` }}>{cardContent}</article>;
          })}
        </div>
      </section>

      <footer className="border-t border-white/[0.08] bg-[#141916]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 text-xs text-[#89968e] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-[#dce4dc]"><BrandMark /><span>PixelPress</span></Link>
          <p>Vos fichiers restent sur votre appareil, sauf indication contraire.</p>
          <nav aria-label="Liens rapides" className="flex gap-4"><Link href="/image/compress" className="hover:text-white">Images</Link><Link href="/pdf" className="hover:text-white">PDF</Link></nav>
        </div>
      </footer>

    </main>
  );
}
