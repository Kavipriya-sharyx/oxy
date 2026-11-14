// Full Plan 11 health check. GET /api/v1/Health is public (load balancer / uptime monitor): status only,
// 200 when the database and Redis answer, 503 when either is down. GET /api/v1/Health/Details needs a
// signed-in user and shows every check with its count or timing.
import { Controller, Get, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JWTAuthController } from "@Controller/JWTAuth.controller";
import { Permission } from "@Helper/Permissions";
import { MonitoringService } from "@Service/Ops/Monitoring.service";

@Controller({ path: "Health", version: "1" })
@ApiTags("Health")
export class HealthController {
  constructor(private readonly _Monitoring: MonitoringService) {}

  @Get()
  async Health(@Res({ passthrough: true }) res: any) {
    const r = await this._Monitoring.check();
    if (r.status === "down") res.status(503);
    return {
      status: r.status,
      checked_at: r.checked_at,
      database: r.checks.database.ok,
      redis: r.checks.redis.ok,
    };
  }
}

@Controller({ path: "Health", version: "1" })
@ApiTags("Health")
export class HealthDetailsController extends JWTAuthController {
  constructor(private readonly _Monitoring: MonitoringService) {
    super();
  }

  @Permission("dashboard.view")
  @Get("Details")
  async Details() {
    return this.SendResponseData(await this._Monitoring.check());
  }
}
