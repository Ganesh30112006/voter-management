import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { ConfirmProvider } from '../hooks/useConfirm';
import { ToastProvider } from '../hooks/useToast';
import { router } from './router';

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ConfirmProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </ConfirmProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
