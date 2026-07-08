import EditClient from './EditClient';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <EditClient />;
}
