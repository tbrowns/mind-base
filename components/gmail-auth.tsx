"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import {
  loadGoogleLibraries,
  initializeGapiClient,
  initializeGIS,
  requestAccessToken,
  isAuthenticated,
  signOut as gmailSignOut,
} from "@/lib/client/gmail";

interface GmailAuthProps {
  onAuthSuccess?: (accessToken: string) => void;
  onSignOut?: () => void;
}

export function GmailAuth({ onAuthSuccess, onSignOut }: GmailAuthProps) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize Google libraries on mount
  useEffect(() => {
    loadGoogleLibraries();

    // Wait for libraries to load
    const checkReady = setInterval(async () => {
      if (window.gapi && window.google?.accounts?.oauth2) {
        clearInterval(checkReady);
        await initializeGapiClient();
        await initializeGIS();
        setIsReady(true);
        setIsAuthorized(isAuthenticated());
      }
    }, 100);

    return () => clearInterval(checkReady);
  }, []);

  const handleAuthorize = async () => {
    if (!isReady) return;

    setIsLoading(true);
    try {
      const token = await requestAccessToken();
      if (token) {
        setIsAuthorized(true);
        onAuthSuccess?.(token);
      }
    } catch (error) {
      console.error("Authorization failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await gmailSignOut();
      setIsAuthorized(false);
      onSignOut?.();
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  if (!isReady) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
        <Spinner size={17} />
        Loading...
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!isAuthorized ? (
        <button
          onClick={handleAuthorize}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0f3d2e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
        >
          {isLoading ? <Spinner size={17} /> : null}
          Authorize Gmail
        </button>
      ) : (
        <>
          <div className="text-xs text-green-600 font-medium">✓ Authorized</div>
          <button
            onClick={handleSignOut}
            className="rounded-xl border border-[#dde3dc] px-4 py-2 text-xs font-semibold text-[#647068]"
          >
            Sign Out
          </button>
        </>
      )}
    </div>
  );
}
