import { redirect } from 'next/navigation';

export default function LegacyAiImagePage() {
  redirect('/ai/image-to-prompt');
}