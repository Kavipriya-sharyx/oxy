import { Controller, MessageEvent, Sse, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { interval, map, merge, Observable } from "rxjs";
import { JwtAuthGuard } from "@Service/Auth/JwtAuthGuard.service";
import { RolesGuard } from "@Service/Auth/RolesGuard.service";
import { LiveEventsService } from "@Service/Live/LiveEvents.service";

// Server-sent events for the console: { topic, conversation_id } when something changed, and a ping every
// 25 s so proxies keep the connection open. Any signed-in console user; the events carry no customer
// data, and the console re-reads through the permission-checked endpoints.
// Not JWTAuthController: its LoggingInterceptor would log every event.
@Controller({ path: "Console", version: "1" })
@ApiTags("Sales Console")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class LiveController {
  constructor(private readonly _Live: LiveEventsService) {}

  @Sse("Live")
  live(): Observable<MessageEvent> {
    return merge(
      this._Live.stream().pipe(map((e) => ({ type: "change", data: e }) as MessageEvent)),
      interval(25_000).pipe(map(() => ({ type: "ping", data: {} }) as MessageEvent)),
    );
  }
}
