import { Outlet } from 'react-router';
import { Shield } from 'lucide-react';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0deg_0%_97.5%)] p-4">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}
