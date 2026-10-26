"use client";

import { createContext, useContext } from "react";
import type { Locale } from "./config";
import en, { type UiDict } from "./ui/en";

const I18nContext = createContext<{ locale: Locale; ui: UiDict }>({ locale: "en", ui: en });

export function I18nProvider({ locale, ui, children }: { locale: Locale; ui: UiDict; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, ui }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
