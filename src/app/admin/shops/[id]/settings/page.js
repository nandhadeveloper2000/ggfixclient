import SettingsClient from './SettingsClient';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function Page() {
  return <SettingsClient />;
}
