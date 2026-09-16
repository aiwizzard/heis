'use client';
import { useParams } from 'next/navigation';
import StandaloneShell from './StandaloneShell';
export default function WebStudioShell(props: { locale?: string }) { return <StandaloneShell {...props} routeParams={useParams()} />; }
