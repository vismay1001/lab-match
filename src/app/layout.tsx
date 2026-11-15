import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LabMatch | Campus Resource Booking",
  description:
    "Find and book university resources with intelligent task-based recommendations.",
};

type NavLinkClassName = "sidebar-nav-link" | "sidebar-nav-link active";

interface NavLink {
  href: string;
  label: string;
  icon?: string;
}

const getNavClassName = (link: NavLink): NavLinkClassName => {
  if (link.href === "/") return "sidebar-nav-link active";
  return "sidebar-nav-link";
};

const navLinks: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/bookings", label: "My Bookings" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full antialiased">
        <div class="flex min-h-screen">
          {/* Sidebar */}
          <aside className="sidebar">
            <a
              href="/"
              className="sidebar-logo flex items-center gap-2"
            >
              Lab<span className="text-primary">Match</span>
            </a>

            <nav className="sidebar-nav">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="sidebar-nav-link">
                  <span className={getNavClassName(link)}>
                    {link.label}
                  </span>
                </a>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="main-content">
            <header className="header">
              <h1 className="header-title">
                Lab<span className="text-primary">Match</span>
              </h1>
            </header>

            {children}
          </main>
        </div>
      </body>
    </html>
  );
}