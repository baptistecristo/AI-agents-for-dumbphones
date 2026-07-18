// Politique réseau des appels sortants des skills (#56).
//
// Les skills contactent des services externes (Open-Meteo, OpenRouteService,
// Google, Vapi…). Rien ne bornait où une requête pouvait partir : un skill mal
// configuré ou hostile pouvait être orienté vers une adresse interne (SSRF) ou
// faire fuiter un secret présent dans une URL. Ce module est le passage unique
// des appels sortants d'un skill. Il applique trois garde-fous :
//   1. Liste blanche d'hôtes autorisés (seuls les services connus sont joignables).
//   2. Garde SSRF : blocage des adresses internes, loopback, link-local et
//      métadonnées cloud — y compris quand un hôte autorisé RÉSOUT vers une IP
//      interne (rebinding DNS).
//   3. Rédaction des secrets présents dans une URL avant tout log.
//
// Limite assumée : la pré-résolution DNS puis le fetch résolvent le nom deux
// fois (fenêtre TOCTOU). Couplée à la liste blanche stricte, c'est une
// mitigation raisonnable ; un pinning par IP n'est pas nécessaire à ce volume.

// Hôtes que les skills ont le droit de joindre. Tout ajout doit être délibéré :
// un nouveau skill qui contacte un service externe ajoute son hôte ici, et la
// revue de la PR le voit. Google passe par le SDK googleapis (pas par safeFetch)
// mais reste listé pour documenter la surface.
const ALLOWED_HOSTS = new Set([
  "geocoding-api.open-meteo.com", // météo, heure
  "api.open-meteo.com", // météo
  "api.openrouteservice.org", // itinéraires
  "api.frankfurter.app", // conversion de devises
  "api.dictionaryapi.dev", // définitions
  "worldtimeapi.org", // heure locale
  "www.googleapis.com", // agenda / contacts (via SDK googleapis)
]);

// Noms de paramètres de requête dont la valeur est un secret : jamais dans un log.
const SECRET_PARAMS = new Set([
  "api_key",
  "apikey",
  "key",
  "token",
  "access_token",
  "auth",
  "secret",
  "password",
]);

export class BlockedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedRequestError";
  }
}

function looksLikeIpv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function ipv4Reserved(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 « this host »
  if (a === 10) return true; // privé
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + métadonnées cloud (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // privé
  if (a === 192 && b === 168) return true; // privé
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC 6598)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking (RFC 2544)
  return false;
}

function ipv6Reserved(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::1" || h === "::") return true; // loopback / non spécifié
  // link-local fe80::/10 (fe80–febf)
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
  // unique-local fc00::/7 (fc.. / fd..)
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4-mappé ::ffff:a.b.c.d
  const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return ipv4Reserved(mapped[1]);
  return false;
}

// Un hôte pointe-t-il vers une ressource interne ? Couvre les IP littérales et
// les noms non routables (localhost, *.internal, *.local).
export function isReservedAddress(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (looksLikeIpv4(h)) return ipv4Reserved(h);
  if (h.includes(":")) return ipv6Reserved(h);
  return false;
}

// Contrôles synchrones (schéma, adresse réservée littérale, liste blanche).
// L'ordre compte : une adresse réservée est bloquée AVANT la liste blanche.
export function assertAllowedUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedRequestError(`URL invalide : ${redactUrl(String(input))}`);
  }
  if (url.protocol !== "https:") {
    throw new BlockedRequestError(`Requête non-HTTPS bloquée vers ${url.host}`);
  }
  const host = url.hostname.toLowerCase();
  if (isReservedAddress(host)) {
    throw new BlockedRequestError(`Requête bloquée vers une adresse interne/réservée : ${host}`);
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new BlockedRequestError(`Hôte hors liste blanche des appels sortants : ${host}`);
  }
  return url;
}

// Garde SSRF sur les IP réellement résolues (rebinding DNS). Les IP littérales
// sont déjà validées par assertAllowedUrl ; on ne résout que les vrais noms.
export async function guardResolvedIps(url: URL, resolve: (host: string) => Promise<string[]>): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (looksLikeIpv4(host) || host.includes(":")) return;
  let ips: string[];
  try {
    ips = await resolve(host);
  } catch {
    throw new BlockedRequestError(`Résolution DNS impossible pour ${host} (contrôle SSRF)`);
  }
  for (const ip of ips) {
    if (isReservedAddress(ip)) {
      throw new BlockedRequestError(`Bloqué : ${host} résout vers une adresse réservée (${ip})`);
    }
  }
}

// Masque les secrets d'une URL (valeurs de paramètres sensibles + userinfo)
// avant qu'elle n'atteigne un log.
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_PARAMS.has(key.toLowerCase())) url.searchParams.set(key, "***");
    }
    if (url.username || url.password) {
      url.username = "***";
      url.password = "";
    }
    return url.toString();
  } catch {
    return raw.replace(/([?&](?:api_?key|key|token|access_token|auth|secret|password)=)[^&#\s]+/gi, "$1***");
  }
}

export type NetDeps = {
  fetch: typeof fetch;
  resolve: (host: string) => Promise<string[]>;
};

async function defaultResolve(host: string): Promise<string[]> {
  // Import dynamique : node:dns n'existe que sur le runtime Node (jamais Edge).
  const { lookup } = await import("node:dns/promises");
  const res = await lookup(host, { all: true });
  return res.map((r) => r.address);
}

const defaultDeps: NetDeps = {
  fetch: (input, init) => fetch(input, init),
  resolve: defaultResolve,
};

// Passage unique des appels sortants d'un skill. Applique la liste blanche, la
// garde SSRF (avec pré-résolution DNS) puis délègue au fetch natif.
export async function safeFetch(input: string | URL, init?: RequestInit, deps: NetDeps = defaultDeps): Promise<Response> {
  const url = assertAllowedUrl(input);
  await guardResolvedIps(url, deps.resolve);
  return deps.fetch(url, init);
}
