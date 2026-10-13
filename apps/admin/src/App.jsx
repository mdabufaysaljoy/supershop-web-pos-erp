import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { SessionGate } from '@/features/auth/components/SessionGate';
import { queryClient } from '@/lib/queryClient';
import { createRouter } from '@/routes/router';

export function App() {
  const [router] = useState(createRouter);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionGate>
        <RouterProvider router={router} />
      </SessionGate>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
