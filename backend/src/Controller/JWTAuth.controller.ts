import { UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { LoggingInterceptor } from "@Helper/Logging.interceptor";
import { JwtAuthGuard } from "@Service/Auth/JwtAuthGuard.service";
import { RolesGuard } from "@Service/Auth/RolesGuard.service";
import { AuthBaseController } from "@Controller/AuthBase.controller";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
@UseInterceptors(LoggingInterceptor)
export class JWTAuthController extends AuthBaseController {}
