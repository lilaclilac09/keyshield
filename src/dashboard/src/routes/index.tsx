import type { RouteObject } from 'react-router';
import { lazy } from 'react';
import { redirect } from 'react-router';
import RootLayout from '../layouts/RootLayout';
import AuthLayout from '../layouts/AuthLayout';
import { isAuthenticated } from '@keyshield/shared/auth';
import { authLoader, protectedLoader } from './loaders';

const Landing = lazy(() => import('../pages/Landing'));
const Login = lazy(() => import('../pages/Login'));
const Vault = lazy(() => import('../pages/Vault'));
const Activity = lazy(() => import('../pages/Activity'));
const Agents = lazy(() => import('../pages/Agents'));
const Sharing = lazy(() => import('../pages/Sharing'));
const Sessions = lazy(() => import('../pages/Sessions'));
const Settings = lazy(() => import('../pages/Settings'));
const Developer = lazy(() => import('../pages/Developer'));
const Docs = lazy(() => import('../pages/Docs'));

export const rootRoutes: RouteObject[] = [
  {
    index: true,
    path: '/',
    element: <Landing />,
  },
  // Redirect /vault → /app/vault for "Launch App" CTA buttons
  {
    path: '/vault',
    loader: async () => redirect('/app/vault'),
  },
  {
    path: '/app',
    element: <RootLayout />,
    loader: protectedLoader,
    children: [
      { index: true, element: <Vault /> },
      { path: 'vault', element: <Vault /> },
      { path: 'activity', element: <Activity /> },
      { path: 'agents', element: <Agents /> },
      { path: 'sharing', element: <Sharing /> },
      { path: 'sessions', element: <Sessions /> },
      { path: 'settings', element: <Settings /> },
      { path: 'developer', element: <Developer /> },
      { path: 'docs', element: <Docs /> },
    ],
  },
  // Auth (wallet connect) route
  {
    path: '/login',
    element: <AuthLayout />,
    loader: authLoader,
    children: [
      { index: true, element: <Login /> },
    ],
  },
  // After login redirect goes to /app/vault
  {
    path: '/connect',
    loader: async () => redirect('/app/vault'),
  },
];
