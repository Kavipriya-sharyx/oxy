import client from "./client";
import type { ApiEnvelope, Booking } from "../types";

// GET /api/v1/Booking/Pending (JWT) -> Booking[]
export async function getPendingBookings(): Promise<Booking[]> {
  const res = await client.get<Booking[]>("/Booking/Pending");
  return res.data;
}

// PUT /api/v1/Booking/Confirm/:Id (JWT) -> { Type: "S", Message }
export async function confirmBooking(id: string): Promise<ApiEnvelope> {
  const res = await client.put<ApiEnvelope>(`/Booking/Confirm/${id}`);
  return res.data;
}
