import './globals.css';

export const metadata = {
  title: 'Repair Shop SaaS – Admin',
  description: 'Super Admin panel for mobile repair SaaS',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
