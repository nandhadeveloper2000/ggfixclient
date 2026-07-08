import './globals.css';

export const metadata = {
  title: 'GGFIX Management Portal',
  description: 'GGFIX Management Portal — super-admin panel',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
