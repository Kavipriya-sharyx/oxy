import { UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { LoggingInterceptor } from "@Helper/Logging.interceptor";
import { JwtAuthGuard } from "@Service/Auth/JwtAuthGuard.service";
import { AuthBaseController } from "@Controller/AuthBase.controller";

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@UseInterceptors(LoggingInterceptor)
export class JWTAuthController extends AuthBaseController {}
