'use client';

import { useSearchParams } from 'next/navigation';

export const EmbedGuard = ({ children }: { children: React.ReactNode }) => {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';

  if (isEmbed) return null;
  return <>{children}</>;
};
