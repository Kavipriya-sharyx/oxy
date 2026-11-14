// Console side (signed-in staff) of the CRM data: KPIs, the Playbook 17 customer record, and the list
// of approved assets that send_approved_asset may use.
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { Permission } from "@Helper/Permissions";
import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
import { AnalyticsService } from "@Service/Crm/Analytics.service";
import { CustomerRecordService } from "@Service/Crm/CustomerRecord.service";
import { approved_asset } from "@Database/Table/Oxxy/approved_asset";
import { isPlaceholder, isRealLink } from "@Helper/GoLive";

const KINDS = ["document", "comparison", "media", "testimonial", "policy", "website", "article"];

@Controller({ path: "Insights", version: "1" })
@ApiTags("Insights")
export class InsightsController extends JWTAuthController {
  constructor(
    private readonly _Analytics: AnalyticsService,
    private readonly _Record: CustomerRecordService,
  ) {
    super();
  }

  /** Trigger & Conversion Layer 13.1 key performance measures. ?from=YYYY-MM-DD&to=YYYY-MM-DD */
  @Permission("dashboard.view")
  @Get("Kpis")
  async Kpis(@Query("from") from?: string, @Query("to") to?: string) {
    return this.SendResponseData(await this._Analytics.kpis(from, to));
  }

  /** The Playbook 17 record for one customer, by field group */
  @Permission("conversations.read")
  @Get("Customers/:Id/Record")
  async Record(@Param("Id") Id: string) {
    return this.SendResponseData(await this._Record.build(Id, { includeHealth: true }));
  }

  @Permission("settings.manage")
  @Get("Assets")
  async Assets() {
    return this.SendResponseData(await approved_asset.find({ order: { trigger_id: "ASC", code: "ASC" } as any }));
  }

  private clean(b: any, partial = false) {
    const out: Record<string, unknown> = {};
    const str = (k: string, max = 300) => {
      if (b[k] === undefined) return;
      const v = String(b[k] ?? "").trim();
      if (!v && !partial) throw new BadRequestException(`${k} is required`);
      out[k] = v.slice(0, max);
    };
    str("code", 80);
    str("title", 200);
    str("url", 1000);
    if (b.kind !== undefined) {
      if (!KINDS.includes(b.kind)) throw new BadRequestException(`kind must be one of ${KINDS.join(", ")}`);
      out.kind = b.kind;
    }
    if (out.url && !/^https:\/\//i.test(String(out.url))) throw new BadRequestException("url must start with https://");
    if (b.language !== undefined) {
      if (!["en", "hi", "hinglish"].includes(b.language)) throw new BadRequestException("language must be en, hi or hinglish");
      out.language = b.language;
    }
    if (b.trigger_id !== undefined) {
      const t = b.trigger_id ? String(b.trigger_id).toUpperCase() : null;
      if (t && !/^[A-R]$/.test(t)) throw new BadRequestException("trigger_id must be A to R");
      out.trigger_id = t;
    }
    if (b.template_name !== undefined) out.template_name = b.template_name ? String(b.template_name).slice(0, 120) : null;
    if (b.valid_to !== undefined) out.valid_to = b.valid_to ? new Date(b.valid_to) : null;
    if (!partial) for (const k of ["code", "title", "url", "kind"]) if (!out[k]) throw new BadRequestException(`${k} is required`);
    return out;
  }

  @Permission("settings.manage")
  @Post("Assets")
  async AddAsset(@Body() body: any) {
    const data = this.clean(body ?? {});
    if (await approved_asset.findOne({ where: { code: String(data.code) } }))
      throw new BadRequestException("An asset with this code already exists");
    // new assets start NOT approved: someone must approve them on purpose
    const row = await approved_asset.save(approved_asset.create({ ...data, approved: false } as any));
    return this.SendResponseData({ id: (row as any).id });
  }

  @Permission("settings.manage")
  @Put("Assets/:Id")
  async UpdateAsset(@Param("Id") Id: string, @Body() body: any, @Req() req: any) {
    const row = await approved_asset.findOne({ where: { id: Id } });
    if (!row) throw new NotFoundException("Asset not found");
    const data = this.clean(body ?? {}, true);
    Object.assign(row, data);
    if (body?.approved !== undefined) {
      if (body.approved && (!isRealLink(row.url) || isPlaceholder(row.title)))
        throw new BadRequestException("Put the real https link and title first: a placeholder cannot be approved");
      row.approved = !!body.approved;
      row.approved_by_id = row.approved ? (req.user?.user_id ?? null) : null;
    }
    // changing what is sent needs a new approval
    if (body?.url !== undefined || body?.title !== undefined) {
      if (body?.approved === undefined) {
        row.approved = false;
        row.approved_by_id = null;
      }
    }
    row.updated_on = new Date();
    await row.save();
    return this.SendResponse(ResponseEnum.Success, ResponseEnum.Updated);
  }
}
