import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { crm_outbox } from "@Database/Table/Crm/crm_outbox";

@Injectable()
export class CrmClient {
  constructor(private readonly _Config: ConfigService) {}

  // POST {CRM_BASE_URL}/{action}. Idempotency-Key = outbox id, so a retry is harmless.
  // Returns the id the CRM gave back (or null).
  async send(row: crm_outbox): Promise<string | null> {
    const res = await axios.post(`${this._Config.get("Crm.BaseUrl")}/${row.action}`, row.payload, {
      headers: {
        "Idempotency-Key": row.id,
        Authorization: `Bearer ${this._Config.get("Crm.ApiKey")}`,
      },
      timeout: 15000,
    });
    const id: unknown = res.data?.id;
    return id == null ? null : String(id);
  }
}
