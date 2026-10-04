/**
 * tripDocAnalyze.ts — looks at the TEXT inside a voucher / ticket PDF to
 *   1) decide which sub-folder it belongs in, and
 *   2) suggest a clear file name in the CustomHolidays style, e.g.
 *        "5th June Schiphol Airport to Renaissance Amsterdam Transfer.pdf"
 *        "Renaissance Amsterdam Hotel Voucher.pdf"
 *        "6th June Zaanse Schans, Edam, Volendam and Marken Tour.pdf"
 * Works on PDFs that contain real text. Scans / photos have no text, so
 * those keep their name (and are flagged so staff can rename them by hand).
 */
import type { CategoryId } from "./tripCategorize";
import { sanitizeName } from "./tripCategorize";

export interface DocAnalysis {
  category: CategoryId | null;  // null = couldn't tell from the text
  title: string | null;         // suggested name WITHOUT extension
}

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

const AIRLINES = [
  "Emirates", "Etihad", "Qatar Airways", "IndiGo", "Air India Express", "Air India", "Vistara", "Akasa Air", "SpiceJet",
  "Lufthansa", "KLM", "Air France", "British Airways", "Singapore Airlines", "Thai Airways", "Cathay Pacific",
  "Turkish Airlines", "Swiss", "Virgin Atlantic", "United Airlines", "Delta", "American Airlines", "Saudia",
  "Oman Air", "flydubai", "Air Arabia", "SriLankan Airlines", "Malaysia Airlines", "Garuda Indonesia", "VietJet",
  "Vietnam Airlines", "Jetstar", "Qantas", "Finnair", "Austrian", "Scoot", "AirAsia", "Ryanair", "easyJet",
  "Air Mauritius", "Kenya Airways", "Ethiopian Airlines", "Gulf Air", "Kuwait Airways", "Air New Zealand",
  "Japan Airlines", "ANA", "Korean Air", "Asiana", "China Southern", "Air Canada", "Iberia", "ITA Airways",
  "Aeroflot", "Azerbaijan Airlines", "Uzbekistan Airways", "Air Seychelles", "Maldivian", "Bhutan Airlines", "Druk Air",
];

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th";
  return `${n}${s}`;
};
const fmtDate = (day: number, monthIdx: number) =>
  day >= 1 && day <= 31 && monthIdx >= 0 && monthIdx < 12
    ? `${ordinal(day)} ${MONTHS[monthIdx][0].toUpperCase()}${MONTHS[monthIdx].slice(1)}`
    : null;
const monthIndex = (m: string) => MONTHS.findIndex(x => x.startsWith(m.toLowerCase().slice(0, 3)));

/** Reads one date from a piece of text → "5th June". Day-first for numeric dates (India/Europe style). */
export function parseDate(s: string): string | null {
  let m = s.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (m) return fmtDate(+m[1], +m[2] - 1);
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return fmtDate(+m[3], +m[2] - 1);
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})?\b/i);
  if (m) return fmtDate(+m[1], monthIndex(m[2]));
  m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (m) return fmtDate(+m[2], monthIndex(m[1]));
  return null;
}

const tidy = (s: string) =>
  s.replace(/\s+/g, " ")
   .replace(/\s+([,.)])/g, "$1")
   .replace(/\(\s+/g, "(")
   .replace(/\s*’\s*/g, "’")
   .trim();

/** "ROTTERDAM C." → "Rotterdam", "BRUXELLES-CENTRAL" → "Bruxelles-Central" */
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s\-/(])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase());
const isShouting = (s: string) => s.length > 3 && s === s.toUpperCase() && /[A-Z]{3}/.test(s);
const nice = (s: string) => (isShouting(s) ? titleCase(s) : s);

function valueAfter(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    const rest = lines[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:–-]+/, "").trim();
    if (rest) return rest;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) if (lines[j].replace(/[*\s>-]/g, "")) return lines[j].trim();
  }
  return null;
}

function findAirline(text: string): string | null {
  for (const a of AIRLINES) if (new RegExp(`\\b${a.replace(/ /g, "\\s*")}\\b`, a === "ANA" || a === "KLM" ? "" : "i").test(text)) return a;
  return null;
}

const has = (t: string, re: RegExp) => re.test(t);

// ── Per-document-type namers ─────────────────────────────────────────────────

function hotelName(lines: string[], text: string): string | null {
  const after = valueAfter(lines, /accommodation details|hotel name\s*:?|property name\s*:?|hotel\s*:/i);
  if (after && after.length < 70 && !/booking|reference|guest/i.test(after)) return after;
  const m = text.match(/\b((?:[A-Z][\w&'’.-]*\s+){0,4}(?:Hotel|Resort|Inn|Suites|Aparthotel|Apartments?|Residences?|Lodge|Hostel|Villas?)(?:\s+[A-Z][\w&'’.-]*){0,3})/);
  return m ? m[1] : null;
}

function transferName(lines: string[], text: string): string | null {
  const date = parseDate(valueAfter(lines, /transfer date|pick[- ]?up date|service date|date of travel/i) || "") || parseDate(text);
  const m = text.match(/transfer\s+from\s+(.+?)\s+to\s+(.+?)(?:\s+by\b|\s+vehicle|\n|$)/i)
        || text.match(/pick\s*up\s*:?\s*(.+?)\n[\s\S]*?drop\s*off\s*:?\s*(.+?)\n/i);
  const route = m ? `${nice(m[1].trim())} to ${nice(m[2].trim())}` : "";
  return [date, route, "Transfer"].filter(Boolean).join(" ");
}

function trainName(lines: string[], text: string): string | null {
  const date = parseDate(valueAfter(lines, /valid on|date of travel|travel date|departure date/i) || "") || parseDate(text);
  const clean = (s: string | null) => s ? titleCase(s.replace(/^[-> ]+/, "").replace(/\s+C\.?$/i, "").replace(/\*+/g, "").trim()) : "";
  let from = clean(valueAfter(lines, /^\s*from\b/i));
  let to = clean(valueAfter(lines, /^\s*to\b/i));
  if (!from || !to) {
    const m = text.match(/\bfrom\s+([A-Z][\w .'-]{2,30}?)\s+to\s+([A-Z][\w .'-]{2,30}?)(?:\s|$)/);
    if (m) { from = clean(m[1]); to = clean(m[2]); }
  }
  return [date, from && to ? `${from} to ${to}` : "", "Train Tickets"].filter(Boolean).join(" ");
}

/** GetYourGuide / Viator / Klook style activity vouchers. */
function activityName(lines: string[], text: string): string | null {
  const idx = lines.findIndex(l => /^date\s*&\s*time/i.test(l));
  const date = parseDate(idx >= 0 ? lines.slice(idx, idx + 3).join(" ") : text);
  let title = idx > 0 ? tidy(lines.slice(0, idx).join(" ")) : "";
  const option = tidy(valueAfter(lines, /tour option description|option\s*:/i) || "");
  if (title && option) {
    const stripped = tidy(title.split(option).join(" "));
    title = stripped.length >= 4 ? stripped : option;
  }
  // "Rotterdam Zoo Blijdorp Ticket Rotterdam Zoo Blijdorp Ticket" → once
  const half = title.length / 2;
  if (title.length > 10 && title.slice(0, half).trim() === title.slice(half).trim()) title = title.slice(0, half).trim();
  if (!title) return null;
  return [date, title.slice(0, 90)].filter(Boolean).join(" ");
}

const BOILERPLATE = /powered by|please|terms|condition|booking|address|http|www\.|@|\bpage\b|scan|print|download|refund|valid|^\W*$/i;

/** Last resort for other e-tickets / passes: date + first sensible heading. */
function genericTicketName(lines: string[], text: string): string | null {
  const date = parseDate(text);
  const pass = text.match(/\b((?:[A-Z][\w’'-]+\s+){1,3}(?:Card|Pass))\b/);
  if (pass) return tidy(pass[1]);   // city cards / passes aren't tied to one date
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    let l = lines[i];
    if (l.length < 4 || l.length > 70 || BOILERPLATE.test(l) || !/[A-Za-z]{3}/.test(l)) continue;
    let j = i;
    while ((l.match(/\(/g) || []).length > (l.match(/\)/g) || []).length && j + 1 < lines.length && j < i + 3) l += " " + lines[++j];
    const title = tidy(l);
    return [date, title, /ticket/i.test(title) ? "" : "Tickets"].filter(Boolean).join(" ");
  }
  return null;
}

function flightName(lines: string[], text: string): string | null {
  const airline = findAirline(text);
  if (/fare (conditions|rules)/i.test(lines.slice(0, 5).join(" "))) return `${airline ? airline + " " : ""}Fare Conditions`;
  let pax = valueAfter(lines, /passenger name|name of passenger|traveller name/i) || "";
  const pi = lines.findIndex(l => /passenger name/i.test(l));
  if (/\/$/.test(pax) && pi >= 0) pax += lines[pi + 2] || "";       // "CHOKSEY/" + "ROMILYOGESHMR"
  let person = "";
  const m = pax.match(/([A-Za-z]+)\s*\/\s*([A-Za-z]+)/);
  if (m) {
    const given = m[2].replace(/(MSTR|MISS|MRS|MS|MR|DR)$/i, "");
    person = titleCase(`${given} ${m[1]}`);
  }
  return [airline || "Flight", "Ticket", person && `- ${person}`].filter(Boolean).join(" ");
}

function documentName(text: string): string | null {
  if (/insurance/i.test(text)) return "Travel Insurance";
  if (/\bvisa\b/i.test(text)) return "Visa";
  if (/passport/i.test(text)) return "Passport";
  return null;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function analyzeDocText(raw: string): DocAnalysis {
  const text = raw.replace(/[ \t ]+/g, " ");
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  if (text.replace(/\s/g, "").length < 30) return { category: null, title: null };
  const head = lines.slice(0, 40).join("\n");

  let category: CategoryId | null = null;
  let title: string | null = null;

  if (has(text, /policy (no|number)|sum insured|insured person|republic of india|date of expiry|place of issue|visa (no|number|type)|number of entries/i)
      && !has(text, /check[- ]?in date|transfer date|booking ref/i)) {
    category = "documents"; title = documentName(text);
  } else if (has(text, /accommodation details|check[- ]?in date|check[- ]?out date|no\.? of nights|room (category|type)|hotel voucher/i)) {
    category = "hotels"; title = hotelName(lines, text); if (title) title += " Voucher";
  } else if (has(head, /transfer details|transfer date|transfer voucher|one way transfer|return transfer|pick[- ]?up time/i)) {
    category = "transfers"; title = transferName(lines, text);
  } else if (has(head, /rail europe|eurail|trenitalia|\bsncf\b|\bdb bahn\b|\bns international\b|train (no|number)|\bcoach \d|seat \d/i)) {
    category = "transfers"; title = trainName(lines, text);
  } else if (has(text, /date\s*&\s*time/i) && has(text, /booking ref|activity provider|tour option/i)) {
    category = "transfers"; title = activityName(lines, text);
  } else if (has(lines.slice(0, 5).join(" "), /fare (conditions|rules)/i)
      || (has(text, /ticket number|e-?ticket receipt|passenger name|booking reference|\bpnr\b|fare (conditions|rules)|baggage allowance/i) && findAirline(text))) {
    category = "flights"; title = flightName(lines, text);
  } else if (has(text, /e-?ticket|entrance ticket|admission|tour|excursion|sightseeing|city card|\bpass\b/i)) {
    category = "transfers"; title = genericTicketName(lines, text);
  } else if (has(text, /passport|visa|insurance/i)) {
    category = "documents"; title = documentName(text);
  }

  title = title ? sanitizeName(tidy(title)).slice(0, 120) : null;
  return { category, title: title || null };
}

/** True when a file name tells you nothing ("scan001.pdf", "WhatsApp Image…", "BKG-88213.pdf"). */
export function isPoorFileName(fileName: string): boolean {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/\.pdf$/i, "");
  const words = stem
    .replace(/whatsapp|image|img|scan(ned)?|camscanner|adobe|document|doc|file|download(ed)?|attachment|untitled|copy|print|pdf|screenshot|photo|page|final|new/gi, " ")
    .replace(/[^A-Za-z]+/g, " ")
    .split(" ")
    .filter(w => w.length >= 3 && !/^[bcdfghjklmnpqrstvwxz]+$/i.test(w));
  return words.length === 0 || (words.length === 1 && words[0].length <= 3);
}
