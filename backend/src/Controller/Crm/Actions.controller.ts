// Playbook 17.1 actions for the CRM, the voice AI and other services (not for browsers).
// Auth: header X-Api-Key = ACTIONS_API_KEY. Errors use real HTTP status codes and a JSON body.
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
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";
import { BotActionsService } from "@Service/Crm/BotActions.service";
import { CustomerRecordService } from "@Service/Crm/CustomerRecord.service";

export function validApiKey(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class ActionsApiKeyGuard implements CanActivate {
  constructor(private readonly _Config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const expected = this._Config.get<string>("Actions.ApiKey");
    if (!expected) throw new ServiceUnavailableException("Actions API is not configured (ACTIONS_API_KEY)");
    const req = context.switchToHttp().getRequest();
    if (!validApiKey(req.headers["x-api-key"], expected)) throw new UnauthorizedException("Invalid API key");
    return true;
  }
}

@Catch()
export class ActionsExceptionFilter implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (e instanceof HttpException) {
      const body = e.getResponse();
      const obj = typeof body === "string" ? { message: body } : (body as Record<string, unknown>);
      res.status(e.getStatus()).json({ error: true, ...obj, status: e.getStatus() });
      return;
    }
    res.status(500).json({ error: true, status: 500, message: "Internal error" }); // never leak details
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
  ) {}

  /** lookup_customer: ?wa_number= or ?customer_id= ; &full=true adds the Playbook 17 record (no health details) */
  @Get("LookupCustomer")
  async lookupCustomer(
    @Query("wa_number") wa_number?: string,
    @Query("customer_id") customer_id?: string,
    @Query("full") full?: string,
  ) {
    const r = await this._Actions.lookupCustomer({ wa_number, customer_id });
    if (full === "true") return { ...r, record: await this._Record.build(r.customer_id, { includeHealth: false }) };
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

  /** set_opt_out: { customer_id | wa_number } */
  @Post("OptOut")
  @HttpCode(200)
  async setOptOut(@Body() body: any) {
    return await this._Actions.setOptOut(body ?? {});
  }

  /** The Playbook 17 record by field group (health details left out) */
  @Get("Customers/:Id/Record")
  async record(@Param("Id") Id: string) {
    return await this._Record.build(Id, { includeHealth: false });
  }
}
