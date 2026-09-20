import { QueryProvider } from './providers/query-provider';
import { AppRoutes } from './routes';

export function App() {
  return (
    <QueryProvider>
      <AppRoutes />
    </QueryProvider>
  );
}
