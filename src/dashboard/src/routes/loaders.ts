import { redirect } from 'react-router';
import { isAuthenticated } from '@keyshield/shared/auth';

export function protectedLoader() {
  if (!isAuthenticated()) {
    return redirect('/login');
  }
  return null;
}

export function authLoader() {
  if (isAuthenticated()) {
    return redirect('/app');
  }
  return null;
}
