"use client";

import { useEffect, useState } from "react";

/** Reads CSS custom properties and re-reads them when the theme changes (for SVG charts). */
export function useThemeVars<T extends string>(names: readonly T[]): Record<T, string> {
  const read = () => {
    if (typeof window === "undefined") return Object.fromEntries(names.map((n) => [n, "#888"])) as Record<T, string>;
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => {
      const v = cs.getPropertyValue(`--${n}`).trim();
      return [n, /^\d+ \d+ \d+$/.test(v) ? `rgb(${v.replace(/ /g, ",")})` : v || "#888"];
    })) as Record<T, string>;
  };
  const [vars, setVars] = useState<Record<T, string>>(read);
  useEffect(() => {
    const update = () => setVars(read());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", update);
    return () => { mo.disconnect(); mq.removeEventListener("change", update); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return vars;
}
