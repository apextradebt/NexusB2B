import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import { useTranslation } from "react-i18next";
import { setTokenGetter } from "@/lib/api";

// Same Auth0 tenant and API as the B2C app (PhoneP2C). Without VITE_AUTH0_DOMAIN the app runs in local mode, without login.
const DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
const CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;
const AUDIENCE = import.meta.env.VITE_AUTH0_IDENTIFIER;
const HOME = window.location.origin + import.meta.env.BASE_URL;

type Auth = { enabled: boolean; userName?: string; userPicture?: string; logout: () => void };
const Ctx = createContext<Auth>({ enabled: false, logout: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!DOMAIN || !CLIENT_ID) return <>{children}</>;
  return (
    <Auth0Provider
      domain={DOMAIN}
      clientId={CLIENT_ID}
      authorizationParams={{ redirect_uri: HOME, audience: AUDIENCE }}
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <RequireLogin>{children}</RequireLogin>
    </Auth0Provider>
  );
}

function RequireLogin({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isLoading, isAuthenticated, error, user, loginWithRedirect, getAccessTokenSilently, logout } = useAuth0();
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) loginWithRedirect();
  }, [isLoading, isAuthenticated, error, loginWithRedirect]);
  useEffect(() => () => setTokenGetter(null), []);

  if (error) return <p className="min-h-screen flex items-center justify-center text-warn font-semibold p-6">{error.message}</p>;
  if (!isAuthenticated) return <p className="min-h-screen flex items-center justify-center text-muted font-medium">{t("auth.signing_in")}</p>;
  // Set while rendering, not in an effect: the pages' own effects run first and may already call the backend.
  setTokenGetter(() => getAccessTokenSilently());
  return (
    <Ctx.Provider value={{ enabled: true, userName: user?.name, userPicture: user?.picture, logout: () => logout({ logoutParams: { returnTo: HOME } }) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
