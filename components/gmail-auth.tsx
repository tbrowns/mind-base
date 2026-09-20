"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "@/components/icons";
import { Spinner } from "@/components/ui";
import {
  loadGoogleLibraries,
  initializeGapiClient,
  initializeGIS,
  requestAccessToken,
  getAccessToken,
  signOut as gmailSignOut,
} from "@/lib/client/gmail";

interface GmailAuthProps {
  /**
   * Receives the Google access token: after a fresh authorization, and also
   * on mount when the tab already holds one from an earlier visit, so the
   * parent's token state never lags behind what this control displays.
   */
  onAuthSuccess?: (accessToken: string) => void;
  onSignOut?: () => void;
}

/**
 * Connects the browser to Gmail through Google's OAuth client. This is
 * Google-only: the token it hands back is sent to our API by the parent, via
 * the session's authenticated `apiFetch`, and is never stored server-side.
 */
export function GmailAuth({ onAuthSuccess, onSignOut }: GmailAuthProps) {
  const [isReady, setIsReady] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Keep the latest callback without re-running the one-time library setup.
  const onAuthSuccessRef = useRef(onAuthSuccess);
  useEffect(() => {
    onAuthSuccessRef.current = onAuthSuccess;
  }, [onAuthSuccess]);

  // Initialize Google libraries on mount
  useEffect(() => {
    loadGoogleLibraries();
    let cancelled = false;

    // Wait for libraries to load
    const checkReady = setInterval(async () => {
      if (!window.gapi || !window.google?.accounts?.oauth2) return;
      clearInterval(checkReady);
      await initializeGapiClient();
      await initializeGIS();
      if (cancelled) return;

      // The Google client keeps the token for the life of the tab, so a user
      // who authorized on an earlier page is still authorized here.
      const existing = getAccessToken();
      setIsReady(true);
      setIsAuthorized(!!existing);
      if (existing) onAuthSuccessRef.current?.(existing);
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(checkReady);
    };
  }, []);

  const handleAuthorize = async () => {
    if (!isReady) return;

    setIsLoading(true);
    setError("");
    try {
      const token = await requestAccessToken();
      if (token) {
        setIsAuthorized(true);
        onAuthSuccess?.(token);
      } else {
        setError("Gmail authorization was not completed.");
      }
    } catch (err) {
      console.error("Authorization failed:", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Gmail authorization failed.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setError("");
    try {
      await gmailSignOut();
      setIsAuthorized(false);
      onSignOut?.();
    } catch (err) {
      console.error("Disconnect failed:", err);
      setError("Could not disconnect Gmail.");
    }
  };

  if (!isReady) {
    return (
      <div className="inline-flex items-center gap-2 rounded-xl bg-[#e9f2ee] px-4 py-3 text-sm font-semibold text-[#587067]">
        <Spinner size={17} />
        Loading Gmail…
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0aa37f]">
            <CheckCircle2 size={14} />
            Gmail connected
          </span>
          <button
            onClick={handleDisconnect}
            className="rounded-xl border border-[#dde3dc] px-4 py-2 text-xs font-semibold text-[#647068]"
          >
            Disconnect Gmail
          </button>
        </>
      )}
      {error && (
        <span role="alert" className="text-xs text-[#b53d31]">
          {error}
        </span>
      )}
    </div>
  );
}
