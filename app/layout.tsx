import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import { AppTopBar } from '@/components/AppTopBar/AppTopBar';
import { MainContainer } from './MainContainer';
import MaterialUIThemeProvider from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Research Portal',
  description: 'TheirStory Research Portal - Explore recorded interviews, lectures, and oral histories',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className=" overflow-x-hidden" lang="en">
      <body>
        <MaterialUIThemeProvider>
          <MainContainer>
            <AppTopBar />
            {children}
          </MainContainer>
        </MaterialUIThemeProvider>
      </body>
    </html>
  );
}
