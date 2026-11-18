import { LOW_STOCK } from "../types";

const currencyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

export function money(value: string | number): string {
  const text = typeof value === "number" ? value.toFixed(2) : value;
  const match = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return "—";
  const whole = BigInt(match[2]);
  const signed = match[1] ? (whole === 0n ? -0 : -whole) : whole;
  const fraction = (match[3] || "").padEnd(2, "0");
  // Formatting Decimal strings through Number loses cents for large totals.
  return currencyFormatter
    .formatToParts(signed)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

export const number = (value: number) =>
  new Intl.NumberFormat("tr-TR").format(value);
export const stockStatus = (stock: number) =>
  stock === 0
    ? { label: "Tükendi", className: "out" }
    : stock <= LOW_STOCK
      ? { label: "Düşük stok", className: "low" }
      : { label: "Stokta", className: "available" };

export function exportCsv(rows: (string | number)[][], filename: string) {
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value);
            // Prevent spreadsheet applications from evaluating product names as formulas.
            const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(";"),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
