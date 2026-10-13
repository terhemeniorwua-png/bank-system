export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function formatNaira(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleString();
}

export function maskAccount(accountNum) {
  if (!accountNum) return "**** ****";
  const str = String(accountNum);
  if (str.length <= 4) return str;
  return `**** ${str.slice(-4)}`;
}
