import { headers } from 'next/headers';

const GalleryNotFoundComponentMobile = () => <div>Gallery not found (Mobile)</div>;

const GalleryNotFoundComponentDesktop = () => <div>Gallery not found (Desktop)</div>;

export const GalleryNotFoundPage = async () => {
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') ?? '';
  const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);

  if (isMobile) {
    return <GalleryNotFoundComponentMobile />;
  }

  return <GalleryNotFoundComponentDesktop />;
};
