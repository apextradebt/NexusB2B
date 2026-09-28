import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FilePlus2, FolderOpen, LineChart, Library, Settings, Tag, Zap, Menu, X, Globe, Moon, Sun, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
//import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";

const navigation = [
  { key: "sidebar.new_quote", href: "/", icon: FilePlus2 },
  { key: "sidebar.quick", href: "/recherche", icon: Zap },
  { key: "sidebar.quotes", href: "/devis", icon: FolderOpen },
  { key: "sidebar.prices", href: "/prix", icon: Tag },
  { key: "sidebar.history", href: "/historique", icon: LineChart },
  { key: "sidebar.reference", href: "/referentiel", icon: Library },
  { key: "sidebar.settings", href: "/parametres", icon: Settings },
];

const logo = `${import.meta.env.BASE_URL}NexusLogo.png`;

export default function Sidebar() {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { t, i18n } = useTranslation();
  //const { enabled, userName, userPicture, logout } = useAuth();
  const { theme, toggleTheme } = useStore();

  const itemClass = (active: boolean) =>
    `flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${active
      ? "bg-white/10 text-lime font-semibold"
      : "text-bright/70 hover:bg-white/5 hover:text-bright"}`;
  const label = "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity duration-300 whitespace-nowrap";

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between bg-hunter text-bright p-4 sticky top-0 z-40 w-full shadow-md">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="w-9 h-9 bg-bright rounded-lg p-1" />
          <span className="font-bold text-lg tracking-tight">Nexus B2B</span>
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 -mr-2 text-bright/70 hover:text-bright" aria-label="Menu">
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {isOpen && <div className="md:hidden fixed inset-0 bg-bokara/40 backdrop-blur-sm z-40" onClick={() => setIsOpen(false)} />}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-50 transition-all duration-300 ease-in-out
        ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        group w-64 md:w-22 md:hover:w-64 md:focus-within:w-64 bg-hunter text-bright p-5 flex flex-col gap-8 overflow-hidden shrink-0 shadow-xl`}
      >
        <div className="flex items-center gap-4 pl-1">
          <img src={logo} alt="" className="w-10 h-10 min-w-10 bg-bright rounded-xl p-1 shadow-sm" />
          <div className={`flex flex-col ${label}`}>
            <span className="font-bold text-xl tracking-tight leading-none">Nexus B2B</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-lime/80 mt-1">{t("sidebar.tagline")}</span>
          </div>
        </div>

        <nav className="flex-1 flex flex-col gap-3">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.key} to={item.href} onClick={() => setIsOpen(false)} className={itemClass(active)} aria-current={active ? "page" : undefined}>
                <item.icon strokeWidth={active ? 2.4 : 1.6} className="w-5 h-5 min-w-5 mr-4" />
                <span className={label}>{t(item.key)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-2">
          <button onClick={toggleTheme} className={itemClass(false)}>
            {theme === "dark" ? <Sun className="w-5 h-5 min-w-5 mr-4" strokeWidth={1.6} /> : <Moon className="w-5 h-5 min-w-5 mr-4" strokeWidth={1.6} />}
            <span className={`${label} text-sm font-medium`}>{theme === "dark" ? t("sidebar.light") : t("sidebar.dark")}</span>
          </button>
          <button onClick={() => i18n.changeLanguage(i18n.language === "fr" ? "en" : "fr")} className={itemClass(false)}>
            <Globe className="w-5 h-5 min-w-5 mr-4" strokeWidth={1.6} />
            <span className={`${label} text-sm font-medium`}>{i18n.language === "fr" ? "English" : "Français"}</span>
          </button>


        </div>
      </aside>
    </>
  );
}
