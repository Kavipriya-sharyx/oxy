import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  constructor() {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    const request = context.switchToHttp().getRequest<Response>();
    this.logger.log(request.url + " - Called");
    return next.handle().pipe(
      tap((data) => {
        this.logger.log(request.url + " - finished - " + `${Date.now() - now}ms`);
      }),
    );
  }
}
