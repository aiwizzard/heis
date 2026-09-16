import React from 'react';
import { createRoot } from 'react-dom/client';
import StandaloneShell from '../components/StandaloneShell';
import '../app/globals.css';
import './desktop.css';
const locale = location.pathname.startsWith('/zh/') ? 'zh' : 'en';
const slug = location.pathname.split('/').filter(Boolean).slice(locale === 'zh' ? 2 : 1);
createRoot(document.getElementById('root')!).render(<StandaloneShell locale={locale} routeParams={{ slug }} />);
