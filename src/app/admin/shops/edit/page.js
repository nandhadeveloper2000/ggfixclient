import { Suspense } from 'react';
import EditClient from './EditClient';

// Static export: a single /admin/shops/edit/ page. The shop id comes from the
// ?id= query string (read client-side via useSearchParams), so one static file
// serves every shop on S3. useSearchParams() requires a Suspense boundary
// during static export.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <EditClient />
    </Suspense>
  );
}
