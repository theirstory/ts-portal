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
  organizationConfig.displayName &&
  organizationConfig.name &&
  organizationConfig.displayName !== organizationConfig.name
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
  return (
    <html className=" overflow-x-hidden" lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-to-main">
          Skip to main content
        </a>
        <MaterialUIThemeProvider>
          <Suspense>
            <MainContainer>
              <EmbedGuard>
                <AppTopBar />
              </EmbedGuard>
              <main
                id="main-content"
                tabIndex={-1}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 0,
                  outline: 'none',
                }}>
                {children}
              </main>
              <FloatingChatDrawer />
            </MainContainer>
          </Suspense>
        </MaterialUIThemeProvider>
      </body>
    </html>
  );
}
