import { providerConfigured } from "@/lib/mail";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="w-4 h-4" aria-hidden>
      <path fill="#f35325" d="M1 1h10v10H1z" /><path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" /><path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

/** Server component: renders provider sign-in buttons only for providers with credentials configured. */
export default function OAuthButtons({ mode = "login" }: { mode?: "login" | "connect" }) {
  const google = providerConfigured("google");
  const microsoft = providerConfigured("microsoft");
  if (!google && !microsoft) return null;
  const cls = "w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50";
  return (
    <div className="space-y-2">
      {google && <a href={`/api/oauth/google/start?mode=${mode}`} className={cls}><GoogleIcon />Continue with Google</a>}
      {microsoft && <a href={`/api/oauth/microsoft/start?mode=${mode}`} className={cls}><MicrosoftIcon />Continue with Microsoft</a>}
      {mode === "login" && (
        <div className="flex items-center gap-3 text-[11px] text-gray-400 py-1">
          <span className="h-px flex-1 bg-gray-200" />or use email<span className="h-px flex-1 bg-gray-200" />
        </div>
      )}
    </div>
  );
}
