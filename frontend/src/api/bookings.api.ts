import client from "./client";
import type { ApiEnvelope, Booking } from "../types";

// GET /api/v1/Booking/Pending (JWT) -> Booking[]
export async function getPendingBookings(): Promise<Booking[]> {
  const res = await client.get<Booking[]>("/Booking/Pending");
  return res.data;
}

// GET /api/v1/Booking/List?status= (JWT) -> Booking[], newest first
export async function listBookings(status?: string): Promise<Booking[]> {
  const res = await client.get<Booking[]>("/Booking/List", { params: status ? { status } : {} });
  return res.data;
}

// PUT /api/v1/Booking/Confirm/:Id (JWT). Only works when the CRM is off; with the CRM on,
// the sales team confirms in the CRM and its webhook updates the booking.
export async function confirmBooking(id: string): Promise<ApiEnvelope> {
  const res = await client.put<ApiEnvelope>(`/Booking/Confirm/${id}`);
  return res.data;
}
