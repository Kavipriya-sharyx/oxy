// Playbook 17.1 actions for the CRM, the voice AI and other services (not for browsers).
// Auth: header X-Api-Key = ACTIONS_API_KEY or a key made in Admin > Developer. Errors use real HTTP status codes and a JSON body.
import {
  ArgumentsHost,
  Body,
  CanActivate,
  Catch,
  Controller,
  ExceptionFilter,
  ExecutionContext,
  Get,
  HttpCode,
  HttpException,
  Injectable,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import { assertId, BotActionsService } from "@Service/Crm/BotActions.service";
import { CustomerRecordService } from "@Service/Crm/CustomerRecord.service";
import { ApiKeyService } from "@Service/Admin/ApiKey.service";
import { CrmPullService } from "@Service/Crm/CrmPull.service";

export function validApiKey(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class ActionsApiKeyGuard implements CanActivate {
  constructor(
    private readonly _Config: ConfigService,
    private readonly _Keys: ApiKeyService,
  ) {}
  // the ACTIONS_API_KEY env key, or an active key made in the console (Admin > Developer)
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const expected = this._Config.get<string>("Actions.ApiKey");
    const req = context.switchToHttp().getRequest();
    const given = req.headers["x-api-key"];
    if (validApiKey(given, expected)) return true;
    if (await this._Keys.verify(given)) return true;
    if (!expected && (await this._Keys.activeCount()) === 0) {
      throw new ServiceUnavailableException(
        "Actions API is not configured (no API key: Admin > Developer)",
      );
    }
    throw new UnauthorizedException("Invalid API key");
  }
}

const CODES: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "gone",
  422: "unprocessable",
  503: "not_configured",
};

@Catch()
export class ActionsExceptionFilter implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    // one shape for every error: { error: true, status, code, message, ...details }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse();
      const obj: Record<string, unknown> =
        typeof body === "string" ? { message: body } : { ...(body as Record<string, unknown>) };
      delete obj.error;
      delete obj.statusCode;
      const code = typeof obj.code === "string" ? obj.code : (CODES[status] ?? "error");
      delete obj.code;
      const message = Array.isArray(obj.message)
        ? obj.message.join("; ")
        : String(obj.message ?? code);
      delete obj.message;
      res.status(status).json({ error: true, status, code, message, ...obj });
      return;
    }
    // never leak details
    res
      .status(500)
      .json({ error: true, status: 500, code: "internal_error", message: "Internal error" });
  }
}

@Controller({ path: "Actions", version: "1" })
@ApiTags("Bot actions (Playbook 17.1)")
@ApiHeader({ name: "x-api-key", required: true })
@UseGuards(ActionsApiKeyGuard)
@UseFilters(ActionsExceptionFilter)
export class ActionsController {
  constructor(
    private readonly _Actions: BotActionsService,
    private readonly _Record: CustomerRecordService,
    private readonly _Pull: CrmPullService,
  ) {}

  // ---- for a CRM that only calls this API (it builds nothing the bot calls) ----

  /** Changes feed: ?after=<last seq read>&limit=1..500. Poll it every 30 to 60 seconds. */
  @Get("Changes")
  async changes(@Query() q: Record<string, string>) {
    return await this._Pull.changes(q);
  }

  /** All customers, oldest first, for the first import: ?limit=1..500&offset= */
  @Get("Customers")
  async listCustomers(@Query() q: Record<string, string>) {
    return await this._Pull.customers(q);
  }

  /** Store the CRM's own customer id: { crm_customer_id } */
  @Put("Customers/:Id/CrmId")
  async linkCustomer(@Param("Id") Id: string, @Body() body: any) {
    return await this._Pull.linkCustomer(Id, body ?? {});
  }

  /** Booking requests: ?status=pending_confirmation (default) | confirmed | changed | cancelled | all */
  @Get("BookingRequests")
  async listBookings(@Query() q: Record<string, string>) {
    return await this._Pull.bookings(q);
  }

  /** The sales team confirmed the slot: { confirmed_by, crm_booking_id? } -> customer gets booking_confirmed */
  @Post("BookingRequests/:Id/Confirm")
  @HttpCode(200)
  async confirmBooking(@Param("Id") Id: string, @Body() body: any) {
    return await this._Pull.confirmBooking(Id, body ?? {});
  }

  /** New date / time: { preferred_date, preferred_time? } -> customer gets booking_rescheduled */
  @Post("BookingRequests/:Id/Reschedule")
  @HttpCode(200)
  async rescheduleBooking(@Param("Id") Id: string, @Body() body: any) {
    return await this._Pull.rescheduleBooking(Id, body ?? {});
  }

  /** Cancelled by the centre or the customer: { reason? } -> customer told, offered another centre once */
  @Post("BookingRequests/:Id/Cancel")
  @HttpCode(200)
  async cancelBooking(@Param("Id") Id: string, @Body() body: any) {
    return await this._Pull.cancelBooking(Id, body ?? {});
  }

  /** Activations (official link sent): ?payment_status=pending (default) | paid | failed | all */
  @Get("Activations")
  async listActivations(@Query() q: Record<string, string>) {
    return await this._Pull.activations(q);
  }

  /** Payment result: { result: paid | failed | refunded, crm_activation_id? } */
  @Post("Activations/:Id/Payment")
  @HttpCode(200)
  async recordPayment(@Param("Id") Id: string, @Body() body: any) {
    return await this._Pull.recordPayment(Id, body ?? {});
  }

  /** Tasks for people: ?status=not_done (default) | open | in_progress | done | all [&type=] */
  @Get("Tasks")
  async listTasks(@Query() q: Record<string, string>) {
    return await this._Pull.tasks(q);
  }

  /** A callback / escalation is done: { outcome?, crm_task_id? } -> the bot may continue the chat */
  @Post("Tasks/:Id/Complete")
  @HttpCode(200)
  async completeTask(@Param("Id") Id: string, @Body() body: any) {
    return await this._Pull.completeTask(Id, body ?? {});
  }

  /** lookup_customer: ?wa_number= or ?customer_id= ; &full=true adds the Playbook 17 record (no health details) */
  @Get("LookupCustomer")
  async lookupCustomer(
    @Query("wa_number") wa_number?: string,
    @Query("customer_id") customer_id?: string,
    @Query("full") full?: string,
  ) {
    const r = await this._Actions.lookupCustomer({ wa_number, customer_id });
    if (full === "true")
      return { ...r, record: await this._Record.build(r.customer_id, { includeHealth: false }) };
    return r;
  }

  /** search_centres: ?city= or ?latitude=&longitude= ; &radius_km=&specialisation= */
  @Get("SearchCentres")
  async searchCentres(@Query() q: Record<string, string>) {
    return await this._Actions.searchCentres(q);
  }

  /** create_booking_request: the Playbook 17.2 payload */
  @Post("BookingRequests")
  @HttpCode(201)
  async createBookingRequest(@Body() body: any) {
    return await this._Actions.createBookingRequest(body ?? {});
  }

  /** create_follow_up: { customer_id | wa_number, scheduled_for (ISO), reason, selected_product?, template_name? } */
  @Post("FollowUps")
  @HttpCode(201)
  async createFollowUp(@Body() body: any) {
    return await this._Actions.createFollowUp(body ?? {});
  }

  /** get_official_plan: ?product=oxxy&plan=vital[&billing=yearly] or ?product=cut_medi_bills */
  @Get("OfficialPlan")
  async getOfficialPlan(@Query() q: Record<string, string>) {
    return await this._Actions.getOfficialPlan(q);
  }

  /** send_approved_asset: { customer_id | wa_number, asset_id | code } */
  @Post("SendAsset")
  @HttpCode(201)
  async sendApprovedAsset(@Body() body: any) {
    return await this._Actions.sendApprovedAsset(body ?? {});
  }

  /** create_escalation: { customer_id | wa_number, priority, reason, callback_window: {from, to}, summary } */
  @Post("Escalations")
  @HttpCode(201)
  async createEscalation(@Body() body: any) {
    return await this._Actions.createEscalation(body ?? {});
  }

  /** Playbook 4.1 consented outbound lead: { wa_number, first_name?, lead_id?, whatsapp_consent: true, consent_source } */
  @Post("StartConversation")
  @HttpCode(201)
  async startConversation(@Body() body: any) {
    return await this._Actions.startConversation(body ?? {});
  }

  /** set_opt_out: { customer_id | wa_number } */
  @Post("OptOut")
  @HttpCode(200)
  async setOptOut(@Body() body: any) {
    return await this._Actions.setOptOut(body ?? {});
  }

  /** The Playbook 17 record by field group (health details left out) */
  @Get("Customers/:Id/Record")
  async record(@Param("Id") Id: string) {
    return await this._Record.build(assertId(Id, "Id"), { includeHealth: false });
  }
}
