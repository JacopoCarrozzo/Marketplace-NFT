// src/utils/string.ts

/**
 * Restituisce la stringa con la prima lettera maiuscola
 * e il resto in minuscolo.
 *
 * Es: "berLin" → "Berlin"
 */
export function capitalizeFirstLetter(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
