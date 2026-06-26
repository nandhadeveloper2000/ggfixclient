import EditClient from './EditClient';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export const dynamicParams = false;

export default function Page() {
  return <EditClient />;
}
