import type { Metadata } from 'next';
import React, { Suspense } from 'react';
import './globals.css';
import { AppTopBar } from '@/components/AppTopBar/AppTopBar';
import { MainContainer } from './MainContainer';
import { EmbedGuard } from './EmbedGuard';
import MaterialUIThemeProvider from '@/components/ThemeProvider';
import { FloatingChatDrawer } from '@/components/FloatingChatDrawer';
import { organizationConfig } from '@/config/organizationConfig';

const siteTitle =
  organizationConfig.displayName && organizationConfig.name && organizationConfig.displayName !== organizationConfig.name
    ? `${organizationConfig.displayName} - ${organizationConfig.name}`
    : organizationConfig.displayName || organizationConfig.name;
const siteDescription = organizationConfig.description;

export const metadata: Metadata = {
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: siteTitle,
    description: siteDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Browser extensions (screen recorders, password managers, accessibility tools) stamp
  // attributes onto <html> before React hydrates, which React then reports as a server/client
  // mismatch it cannot patch. Nothing here renders differently per environment, so suppress the
  // warning at this level too — <body> already does the same.
  return (
    <html className=" overflow-x-hidden" lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <MaterialUIThemeProvider>
          <Suspense>
            <MainContainer>
              <EmbedGuard>
                <AppTopBar />
              </EmbedGuard>
              {children}
              <FloatingChatDrawer />
            </MainContainer>
          </Suspense>
        </MaterialUIThemeProvider>
      </body>
    </html>
  );
}
