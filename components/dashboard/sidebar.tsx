import Link from "next/link";

import { logout } from "@/app/auth/actions";

const links = [
  { href: "/", label: "Pregled" },
  { href: "/oglasi", label: "Oglasi" },
  { href: "/logovi", label: "Logovi" },
];

const adminLinks = [
  { href: "/admin/kategorije", label: "Kategorije" },
  { href: "/admin/korisnici", label: "Korisnici" },
];

type SidebarProps = {
  isAdmin: boolean;
  email: string | null;
};

export function DashboardSidebar({ isAdmin, email }: SidebarProps) {
  return (
    <aside className="flex w-full flex-col border-b border-zinc-200 bg-white md:w-56 md:border-b-0 md:border-r">
      <div className="border-b border-zinc-100 px-4 py-5">
        <Link href="/" className="text-lg font-bold text-teal-700">
          OLX Dashboard
        </Link>
        <p className="mt-1 truncate text-xs text-zinc-500">{email}</p>
        <span className="mt-2 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
          {isAdmin ? "Admin" : "Radnik"}
        </span>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-2 py-3 md:flex-col md:overflow-visible">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-teal-50 hover:text-teal-800"
          >
            {link.label}
          </Link>
        ))}
        {isAdmin &&
          adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-teal-50 hover:text-teal-800"
            >
              {link.label}
            </Link>
          ))}
      </nav>

      <div className="mt-auto hidden border-t border-zinc-100 p-3 md:block">
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50"
          >
            Odjava
          </button>
        </form>
      </div>
    </aside>
  );
}
