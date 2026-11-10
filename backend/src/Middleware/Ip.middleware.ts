import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { RequestContextService } from "@Service/Admin/Request-Context.service";

@Injectable()
export class IpMiddleware implements NestMiddleware {
  constructor(private readonly contextService: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // First check if x-forwarded-for header exists (proxy setup)
    let userIp = req.headers["x-forwarded-for"] as string;

    if (userIp) {
      // In case of multiple proxies, x-forwarded-for contains a comma-separated list of IPs
      userIp = userIp.split(",")[0]; // Take the first IP in the list
    } else {
      // Fallback to req.socket.remoteAddress if no proxy header
      userIp = req.socket.remoteAddress || "127.0. 0.1";
    }

    // Store the user IP in the context for the entire request lifecycle
    this.contextService.run(() => {
      this.contextService.set("userIp", userIp); // Store IP dynamically
      next();
    });
  }
}
