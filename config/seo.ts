export interface ToolSeo {
  title: string;
  description: string;
  keywords: string[];
}

export const toolsSeo: Record<string, ToolSeo> = {
  // --- OUTILS PDF ---
  split: {
    title: 'Diviser un PDF en Ligne Gratuitement - Extraire des Pages',
    description: 'Séparez vos documents PDF ou extrayez des pages spécifiques en quelques secondes. Outil gratuit, rapide et sécurisé sans inscription.',
    keywords: ['diviser pdf', 'séparer pdf', 'extraire pages pdf en ligne', 'découper pdf gratuit'],
  },
  merge: {
    title: 'Fusionner des PDF en Ligne Gratuit - Combiner plusieurs Fichiers',
    description: 'Assemblez plusieurs fichiers PDF en un seul document ordonné. Fusion illimitée, rapide et respectueuse de vos données.',
    keywords: ['fusionner pdf', 'combiner pdf', 'assembler pdf gratuit', 'rassembler fichiers pdf'],
  },
  compress: {
    title: 'Compresser un PDF en Ligne - Réduire la Taille sans Perte',
    description: 'Diminuez le poids de vos fichiers PDF tout en préservant une lisibilité maximale pour l’envoi par e-mail.',
    keywords: ['compresser pdf', 'réduire taille pdf', 'alléger pdf en ligne', 'optimiser pdf'],
  },
  toWord: {
    title: 'Convertir PDF en Word (DOCX) Gratuitement en Ligne',
    description: 'Transformez vos PDF en documents Word modifiables instantanément. Mise en page préservée et texte éditable.',
    keywords: ['convertir pdf en word', 'pdf to docx', 'transformer pdf en texte modifiable'],
  },
  toExcel: {
    title: 'Convertir PDF en Excel (XLSX) - Extraire Tableaux en Ligne',
    description: 'Extrayez automatiquement les tableaux de vos PDF vers des classeurs Excel structurés et modifiables.',
    keywords: ['convertir pdf en excel', 'pdf en tableau xlsx', 'extraire table pdf'],
  },
  sign: {
    title: 'Signer un PDF en Ligne Gratuitement - Signature Électronique',
    description: 'Ajoutez une signature manuscrite ou un paraphe sur vos contrats et documents PDF directement depuis votre navigateur.',
    keywords: ['signer pdf en ligne', 'signature pdf gratuite', 'parapher pdf', 'remplir et signer'],
  },
  protect: {
    title: 'Protéger un PDF par Mot de Passe - Sécuriser vos Fichiers',
    description: 'Verrouillez vos documents confidentiels avec un chiffrement sécurisé et un mot de passe personnalisé.',
    keywords: ['protéger pdf', 'mot de passe pdf', 'sécuriser pdf en ligne', 'chiffrer document pdf'],
  },

  // --- OUTILS IMAGES & MÉDIAS ---
  imageConvert: {
    title: 'Convertisseur d’Images Gratuit - PNG, JPG, WEBP, SVG',
    description: 'Convertissez facilement vos photos et illustrations d’un format à l’autre en haute qualité et sans filigrane.',
    keywords: ['convertir png en jpg', 'convertir image webp', 'convertisseur format image gratuit'],
  },
  imageCompress: {
    title: 'Compresser des Images en Ligne - Réduire le Poids JPG & PNG',
    description: 'Optimisez le poids de vos images pour le Web sans dégrader leur qualité visuelle.',
    keywords: ['compresser image en ligne', 'optimiser jpeg', 'réduire poids image web'],
  },
  imageToPrompt: {
    title: 'Générateur de Prompt IA depuis Image - Image to Prompt',
    description: 'Analysez n’importe quelle image avec l’IA pour obtenir une description textuelle détaillée et optimisée pour Midjourney ou DALL-E.',
    keywords: ['image to prompt ia', 'décrire image ia', 'reverse prompt image', 'analyseur image ai'],
  },
};
