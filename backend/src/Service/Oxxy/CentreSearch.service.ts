import { Injectable } from "@nestjs/common";
import { ILike } from "typeorm";
import { centre } from "@Database/Table/Oxxy/centre";

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface CentreQuery {
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  specialisation?: string;
  city?: string;
}

@Injectable()
export class CentreSearchService {
  // up to 5 verified, active centres. With lat/long: within radius, nearest first. Else: by city.
  async search(q: CentreQuery): Promise<(centre & { distance_km?: number })[]> {
    const where: any = { verified: true, active: true, status: true, is_private: true }; // plan 6.1: verified private only
    if (q.latitude == null && q.city) where.city = ILike(q.city);
    let list = await centre.find({ where });
    if (q.specialisation) {
      const s = q.specialisation.toLowerCase();
      list = list.filter((c) => (c.specialisations || []).some((x) => x.toLowerCase() === s));
    }
    if (q.latitude != null && q.longitude != null) {
      const radius = q.radiusKm ?? 10;
      return list
        .map((c) =>
          Object.assign(c, {
            distance_km: distanceKm(q.latitude, q.longitude, c.latitude, c.longitude),
          }),
        )
        .filter((c) => c.distance_km <= radius)
        .sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, 5);
    }
    return list.slice(0, 5);
  }
}
