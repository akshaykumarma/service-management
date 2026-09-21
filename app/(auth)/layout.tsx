export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <img src="/logo.png" alt="Shubha Sewing" />
      {children}
    </div>
  );
}
