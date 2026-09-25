import { createContext, useContext, useEffect } from "react";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";

type AuthCtx = {
  enabled: boolean;
  userName?: string;
  userPicture?: string;
  getToken: () => Promise<string | undefined>;
  logout: () => void;
};

const Ctx = createContext<AuthCtx>({ enabled: false, getToken: async () => undefined, logout: () => {} });
export const useAuth = () => useContext(Ctx);

const domain = import.meta.env.VITE_AUTH0_DOMAIN || "";
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || "";

function Loader({ label }: { label: string }) {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center gap-6 hero-gradient text-bright">
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-t-2 border-lime animate-spin" />
        <div className="absolute inset-2 rounded-full border-r-2 border-whisper animate-spin-reverse" />
        <img src={`${import.meta.env.BASE_URL}NexusLogo.svg`} alt="" className="absolute inset-5 w-10 h-10" />
      </div>
      <p className="text-sm font-medium tracking-widest uppercase">{label}</p>
    </div>
  );
}

function Auth0Gate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, error, user, loginWithRedirect, getAccessTokenSilently, logout } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) loginWithRedirect();
  }, [isLoading, isAuthenticated, error, loginWithRedirect]);

  if (error) return <Loader label={`Erreur d'authentification : ${error.message}`} />;
  if (isLoading || !isAuthenticated) return <Loader label="Authentification en cours…" />;

  return (
    <Ctx.Provider
      value={{
        enabled: true,
        userName: user?.email?.split("@")[0].replace(".", " ") || user?.name,
        userPicture: user?.picture,
        getToken: async () => {
          try {
            return await getAccessTokenSilently();
          } catch {
            return undefined;
          }
        },
        logout: () => logout({ logoutParams: { returnTo: window.location.origin + import.meta.env.BASE_URL } }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * Same Auth0 tenant as the B2C app. Without VITE_AUTH0_DOMAIN (local dev) the app runs unauthenticated
 * and the sidebar shows "Mode local".
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!domain || !clientId) return <Ctx.Provider value={{ enabled: false, getToken: async () => undefined, logout: () => {} }}>{children}</Ctx.Provider>;
  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin + import.meta.env.BASE_URL,
        audience: import.meta.env.VITE_AUTH0_IDENTIFIER,
      }}
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <Auth0Gate>{children}</Auth0Gate>
    </Auth0Provider>
  );
}
