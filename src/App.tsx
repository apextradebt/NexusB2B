import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { StoreProvider } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import NewQuote from "@/pages/NewQuote";
import Quotes from "@/pages/Quotes";
import AllQuotes from "@/pages/AllQuotes";
import ShopPrices from "@/pages/ShopPrices";
import Shipments from "@/pages/Shipments";
import Reference from "@/pages/Reference";
import SettingsPage from "@/pages/Settings";
import PriceList from "@/pages/PriceList";
import QuickSearch from "@/pages/QuickSearch";
import TradeInHistory from "@/pages/TradeInHistory";

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <HashRouter>
          <div className="flex flex-col md:flex-row min-h-screen bg-bg text-ink w-full">
            <Sidebar />
            <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-10">
              <Routes>
                <Route path="/" element={<NewQuote />} />
                <Route path="/recherche" element={<QuickSearch />} />
                <Route path="/devis" element={<Quotes />} />
                <Route path="/tous-les-devis" element={<AllQuotes />} />
                <Route path="/tarifs-boutiques" element={<ShopPrices />} />
                <Route path="/expeditions" element={<Shipments />} />
                <Route path="/prix" element={<PriceList />} />
                <Route path="/historique" element={<TradeInHistory />} />
                <Route path="/referentiel" element={<Reference />} />
                <Route path="/parametres" element={<SettingsPage />} />
              </Routes>
            </main>
          </div>
        </HashRouter>
      </StoreProvider>
    </AuthProvider>
  );
}
