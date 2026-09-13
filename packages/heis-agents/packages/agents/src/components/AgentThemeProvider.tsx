'use client'

import React from 'react'
import { ThemeProvider } from 'next-themes'

export const AgentThemeProvider = ({ children }: React.PropsWithChildren) => {
  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme="system" 
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}

export default AgentThemeProvider
