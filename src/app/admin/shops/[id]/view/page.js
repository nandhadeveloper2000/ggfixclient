import ViewClient from './ViewClient';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <ViewClient />;
}
