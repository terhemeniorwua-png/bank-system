"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ShieldCheck,
  KeyRound,
  LogOut,
  Mail,
  CreditCard,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { maskAccount } from "@/lib/utils";
import PinInput from "@/app/components/PinInput";
import PinResetFlow from "@/app/components/PinResetFlow";
import { PIN_CREATED_EVENT } from "@/app/components/PinReminder";

const PIN_FORMAT = /^\d{4}$/;
const MAX_AVATAR_BYTES = 1024 * 1024;
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfilePage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const fileInputRef = useRef(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const [avatarSuccess, setAvatarSuccess] = useState(null);

  const [newPin, setNewPin] = useState("");
  const [fieldError, setFieldError] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [resetFlowOpen, setResetFlowOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (!user) return;

    let active = true;
    (async () => {
      try {
        const res = await api.me();
        if (active) setProfile(res?.user || null);
      } catch (err) {
        if (active) setProfileError(err.message || "Could not load profile");
      } finally {
        if (active) setLoadingProfile(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [user, authLoading, router]);

  const hasPin =
    profile?.hasPin !== undefined ? profile.hasPin : Boolean(profile?.pin);

  const handlePickPhoto = () => {
    setAvatarError(null);
    setAvatarSuccess(null);
    fileInputRef.current?.click();
  };

  const handleAvatarSelected = async (event) => {
    const file = event.target.files?.[0];
    // Allow selecting the same file again after a failure or removal.
    event.target.value = "";
    if (!file) return;

    setAvatarError(null);
    setAvatarSuccess(null);

    if (!AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image is too large. Please choose a photo under 1 MB.");
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error("Could not read the selected file. Please try again."));
      reader.readAsDataURL(file);
    }).catch((err) => {
      setAvatarError(err.message);
      return null;
    });
    if (!dataUrl) return;

    setUploadingAvatar(true);
    try {
      const res = await api.updateAvatar({ avatar: dataUrl });
      if (res?.user) setProfile(res.user);
      setAvatarSuccess("Profile picture updated.");
    } catch (err) {
      const validationMessage = err?.data?.errors?.[0]?.message;
      setAvatarError(
        validationMessage ||
          err.message ||
          "Could not update your profile picture. Please try again."
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarError(null);
    setAvatarSuccess(null);
    setUploadingAvatar(true);
    try {
      const res = await api.removeAvatar();
      if (res?.user) setProfile(res.user);
      setAvatarSuccess("Profile picture removed.");
    } catch (err) {
      setAvatarError(
        err.message || "Could not remove your profile picture. Please try again."
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCreatePin = async (event) => {
    event.preventDefault();
    setBanner(null);
    setFieldError({});

    if (!PIN_FORMAT.test(newPin)) {
      setFieldError({ newPin: "Your PIN must be exactly 4 digits" });
      return;
    }

    setSubmitting(true);
    try {
      await api.createPin({
        accNum: profile?.accountNumber,
        pin: newPin,
      });
      setBanner({
        type: "success",
        message: "Your transaction PIN has been created successfully.",
      });
      setNewPin("");
      setProfile((prev) => (prev ? { ...prev, hasPin: true } : prev));
      // Let the global PIN reminder know setup is done so it stops nagging.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(PIN_CREATED_EVENT));
      }
    } catch (err) {
      setBanner({
        type: "error",
        message: err.message || "Could not create your PIN. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  if (authLoading || loadingProfile) {
    return (
      <div className="min-h-screen bg-pale-bg">
        <div className="mx-auto max-w-md px-4 py-8">
          <div className="h-40 animate-pulse rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pale-bg pb-24">
      <div className="sticky top-0 z-10 border-b border-border bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-full hover:bg-pale-bg transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-text-primary" />
          </Link>
          <h1 className="text-lg font-semibold text-text-primary">
            Profile &amp; Settings
          </h1>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {profileError && (
          <div className="rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
            {profileError}
          </div>
        )}

        <section className="rounded-2xl border border-border bg-white p-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handlePickPhoto}
              disabled={uploadingAvatar}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary-deep transition-opacity hover:opacity-90 disabled:opacity-60"
              aria-label="Change profile picture"
            >
              {profile?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar}
                  alt={profile?.name ? `${profile.name}'s profile picture` : "Profile picture"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-white">
                  {(profile?.name || user?.name || "U").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </span>
              <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary">
                {uploadingAvatar ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Camera className="h-3 w-3 text-white" />
                )}
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-text-primary">
                {profile?.name || user?.name}
              </p>
              <p className="flex items-center gap-1 truncate text-sm text-text-secondary">
                <Mail className="h-3.5 w-3.5" />
                {profile?.email || user?.email}
              </p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePickPhoto}
                  disabled={uploadingAvatar}
                  className="text-sm font-medium text-primary transition-colors hover:text-primary-deep disabled:opacity-50"
                >
                  {profile?.avatar ? "Change photo" : "Upload photo"}
                </button>
                {profile?.avatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                    className="flex items-center gap-1 text-sm font-medium text-error transition-colors hover:text-error/80 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            className="hidden"
            onChange={handleAvatarSelected}
          />

          {avatarError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-error/25 bg-error/10 p-3 text-sm text-error"
            >
              {avatarError}
            </div>
          )}
          {avatarSuccess && (
            <div
              role="status"
              className="mt-4 rounded-xl bg-success/10 p-3 text-sm text-success"
            >
              {avatarSuccess}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between rounded-xl bg-pale-bg px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-text-secondary">
              <CreditCard className="h-4 w-4" />
              Account number
            </span>
            <span className="text-sm font-medium text-text-primary">
              {profile?.accountNumber
                ? maskAccount(profile.accountNumber)
                : "Unavailable"}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-light-blue">
              <KeyRound className="h-4 w-4 text-primary" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {hasPin ? "Transaction PIN" : "Create Transaction PIN"}
              </h2>
              <p className="text-xs text-text-secondary">
                {hasPin
                  ? "The 4-digit PIN used to authorise transactions."
                  : "Set a 4-digit PIN to authorise your transactions."}
              </p>
            </div>
          </div>

          {banner && (
            <div
              role="status"
              className={`mb-4 rounded-xl p-3 text-sm ${
                banner.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-error/10 text-error"
              }`}
            >
              {banner.message}
            </div>
          )}

          {hasPin ? (
            // Step-by-step reset: intro → current PIN → new PIN → confirm.
            <button
              type="button"
              onClick={() => setResetFlowOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-light-blue py-3 font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <RefreshCw className="h-4 w-4" />
              Reset Pin
            </button>
          ) : (
            <form onSubmit={handleCreatePin} className="space-y-5">
              <PinInput
                id="new-pin"
                label="New PIN"
                value={newPin}
                onChange={setNewPin}
                error={fieldError.newPin}
                disabled={submitting}
              />

              <button
                type="submit"
                disabled={submitting || !newPin}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-white transition-colors hover:bg-primary-deep disabled:opacity-50"
              >
                {submitting ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5" />
                    Create PIN
                  </>
                )}
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-white p-2">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-error transition-colors hover:bg-error/5"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Log out</span>
          </button>
        </section>
      </div>

      <PinResetFlow
        isOpen={resetFlowOpen}
        onClose={() => setResetFlowOpen(false)}
        onSuccess={() =>
          setBanner({
            type: "success",
            message: "Your transaction PIN has been reset successfully.",
          })
        }
      />
    </div>
  );
}
