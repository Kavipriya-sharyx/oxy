import { Injectable } from "@nestjs/common";
import { ILike } from "typeorm";
import { centre } from "@Database/Table/Oxxy/centre";

// Playbook 10 / Trigger layer 6: up to five verified private centres from the approved directory only,
// ranked by relevance, reasonable distance and the customer's locality, with specialist and multispeciality
// choices mixed where relevant. Never a name from model memory.

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// The words customers use -> the directory's specialisation names (Playbook 10 table)
const SYNONYMS: [RegExp, string][] = [
  [/\b(eye|eyes|vision|ophthalm\w*|cataract|lasik|aankh|आँख|आंख)\b/iu, "ophthalmology"],
  [/\b(dental|dentist|teeth|tooth|oral|daant|दांत|दाँत)\b/iu, "dental"],
  [/\b(skin|derma\w*|hair fall|acne|twacha|त्वचा)\b/iu, "dermatology"],
  [/\b(cancer|onco\w*|tumou?r|chemo\w*|कैंसर)\b/iu, "oncology"],
  [/\b(heart|cardi\w*|dil|दिल)\b/iu, "cardiology"],
  [/\b(bone|bones|ortho\w*|joint|knee|spine|haddi|हड्डी)\b/iu, "orthopaedics"],
  [/\b(child|children|kids?|paediatric\w*|pediatric\w*|bachche|बच्चे)\b/iu, "paediatrics"],
  [/\b(gyn\w*|obstetric\w*|pregnan\w*|women)\b/iu, "gynaecology"],
  [/\b(kidney|nephro\w*|dialysis|गुर्दा)\b/iu, "nephrology"],
  [/\b(ent|ear|nose|throat)\b/iu, "ent"],
  [/\b(blood test|pathology|lab|labs)\b/iu, "pathology"],
  [/\b(x-?ray|scan|mri|ct|ultrasound|radiology)\b/iu, "radiology"],
  [/\b(general|physician|fever|check-?up)\b/iu, "general"],
];

export function normaliseSpecialisation(s?: string | null): string | null {
  const t = (s || "").trim().toLowerCase();
  if (!t) return null;
  for (const [re, name] of SYNONYMS) if (re.test(t)) return name;
  return t;
}

/** The directory's name for what the customer wrote, or null when the words are not recognised ("orthi") */
export function knownSpecialisation(s?: string | null): string | null {
  const t = (s || "").trim().toLowerCase();
  if (!t) return null;
  for (const [re, name] of SYNONYMS) if (re.test(t) || t === name) return name;
  return null;
}

export interface CentreQuery {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  specialisation?: string | null;
  city?: string | null;
  locality?: string | null;
  /** centres not to suggest again (e.g. the one whose booking was just cancelled) */
  exclude?: string[];
}

export type FoundCentre = centre & { distance_km?: number; locality_match?: boolean };

const same = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Ranked list (pure): locality match, then distance, then name; at most 5, both centre kinds when possible */
export function rankCentres(list: FoundCentre[], q: CentreQuery): FoundCentre[] {
  const radius = q.radiusKm ?? 10;
  // the origin: the customer's pin, else a directory centre in the customer's locality
  let origin: { lat: number; lon: number } | null =
    q.latitude != null && q.longitude != null ? { lat: q.latitude, lon: q.longitude } : null;
  if (!origin && q.locality) {
    const anchor = list.find((c) => same(c.locality, q.locality) && c.latitude != null && c.longitude != null);
    if (anchor) origin = { lat: Number(anchor.latitude), lon: Number(anchor.longitude) };
  }
  let ranked = list.map((c) => {
    const d =
      origin && c.latitude != null && c.longitude != null
        ? distanceKm(origin.lat, origin.lon, Number(c.latitude), Number(c.longitude))
        : undefined;
    return Object.assign(c, { distance_km: d, locality_match: same(c.locality, q.locality) });
  });
  if (origin) ranked = ranked.filter((c) => c.locality_match || c.distance_km == null || c.distance_km <= radius);
  ranked.sort(
    (a, b) =>
      Number(b.locality_match) - Number(a.locality_match) ||
      (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9) ||
      a.name.localeCompare(b.name),
  );
  const top = ranked.slice(0, 5);
  // Playbook 10: specialist AND multispeciality choices where relevant
  if (q.specialisation && top.length >= 2) {
    const isMulti = (c: centre) => c.centre_type === "multispeciality";
    const missingMulti = !top.some(isMulti) && ranked.find(isMulti);
    const missingSpecialist = !top.some((c) => !isMulti(c)) && ranked.find((c) => !isMulti(c));
    const add = missingMulti || missingSpecialist;
    if (add && !top.includes(add)) top[top.length - 1] = add;
  }
  return top;
}

@Injectable()
export class CentreSearchService {
  async search(q: CentreQuery): Promise<FoundCentre[]> {
    const where: any = { verified: true, active: true, status: true, is_private: true }; // plan 6.1: verified private only
    if (q.latitude == null && q.city) where.city = ILike(q.city.trim());
    let list = (await centre.find({ where })) as FoundCentre[];
    if (q.exclude?.length) list = list.filter((c) => !q.exclude!.includes(c.id));
    const wanted = normaliseSpecialisation(q.specialisation);
    if (wanted) list = list.filter((c) => (c.specialisations || []).some((x) => normaliseSpecialisation(x) === wanted));
    return rankCentres(list, { ...q, specialisation: wanted });
  }
}
