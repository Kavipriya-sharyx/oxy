import { Module } from "@nestjs/common";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import Configuration from "./Config/Configuration";
import { redisDb } from "./Config/Redis";
import { MulterModule } from "@nestjs/platform-express";
import { Redis } from "ioredis";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ClsModule } from "nestjs-cls";
import { CacheService } from "./Service/Cache.service";
import { AutoNumberController } from "./Controller/Admin/AutoNumber.controller";
import { LoginController } from "./Controller/Auth/Login.controller";
import { UserController } from "./Controller/Admin/User.controller";
import { UserRoleController } from "./Controller/Admin/UserRole.controller";
import { AuthService } from "./Service/Auth/Auth.service";
import { UserService } from "./Service/Admin/User.service";
import { UserRoleService } from "./Service/Admin/UserRole.service";
import { EmailService } from "./Service/Email.service";
import { MailerService } from "./Service/Mailer.service";
import { CommonService } from "./Service/Common.service";
import { JwtStrategy } from "./Service/Auth/JwtStrategy.service";
import { ErrorLogController } from "./Controller/Admin/ErrorLog.controller";
import { AuditLogController } from "./Controller/Admin/AuditLog.controller";
import { ErrorLogService } from "./Service/Admin/ErrorLog.service";
import { AuditLogService } from "./Service/Admin/AuditLog.service";
import { ExceptionHelper } from "./Helper/Exception.helper";
import { EncryptionService } from "./Service/Encryption.service";
import { CommonSeederService } from "./Database/Seeds/CommonSeeder.service";
import { OxxySeederService } from "./Database/Seeds/OxxySeeder.service";
import { WhatsappWebhookController } from "./Controller/Oxxy/WhatsappWebhook.controller";
import { BookingController } from "./Controller/Oxxy/Booking.controller";
import { WhatsappClient } from "./Service/Oxxy/WhatsappClient.service";
import { WhatsappDevSendController } from "./Controller/Oxxy/WhatsappDevSend.controller";
import { GuardrailService } from "./Service/Oxxy/Guardrail.service";
import { ClaudeService } from "./Service/Oxxy/Claude.service";
import { ReplyValidatorService } from "./Service/Oxxy/ReplyValidator.service";
import { ValueCheckService } from "./Service/Oxxy/ValueCheck.service";
import { DateWindowService } from "./Service/Oxxy/DateWindow.service";
import { BookingService } from "./Service/Oxxy/Booking.service";
import { CentreSearchService } from "./Service/Oxxy/CentreSearch.service";
import { ChatPipelineService } from "./Service/Oxxy/ChatPipeline.service";
import { ConversationRepository } from "./Service/Oxxy/ConversationRepository.service";
import { CustomerLockService } from "./Service/Oxxy/CustomerLock.service";
import { InboundQueueService } from "./Service/Oxxy/InboundQueue.service";
import { WhatsappInboundService } from "./Service/Oxxy/WhatsappInbound.service";
import { CrmClient } from "./Service/Crm/CrmClient.service";
import { CrmOutboxService } from "./Service/Crm/CrmOutbox.service";
import { CrmWebhookService } from "./Service/Crm/CrmWebhook.service";
import { CrmWebhookController } from "./Controller/Crm/CrmWebhook.controller";
import { CrmAdminController } from "./Controller/Crm/CrmAdmin.controller";
import { ConsoleController } from "./Controller/Oxxy/Console.controller";
import { TriggerEngineService } from "./Service/Oxxy/TriggerEngine.service";
import { FollowUpSchedulerService } from "./Service/Oxxy/FollowUpScheduler.service";
import { SystemConfigService } from "./Service/Admin/SystemConfig.service";

@Module({
  imports: [
    ClsModule,
    ServeStaticModule.forRoot({
      rootPath: __dirname + "/client",
      exclude: ["/api{/*path}", "/swagger{/*path}", "/swagger-json"], // Express 5 wildcard syntax
    }),
    EventEmitterModule.forRoot({ maxListeners: 0 }),
    ConfigModule.forRoot({ isGlobal: true, load: [Configuration] }),
    MulterModule.register(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (_ConfigService: ConfigService) => ({
        type: "postgres",
        host: _ConfigService.get("Database.Host"),
        port: _ConfigService.get("Database.Port"),
        username: _ConfigService.get("Database.User"),
        password: _ConfigService.get("Database.Password"),
        database: _ConfigService.get("Database.Name"),
        synchronize: _ConfigService.get("Database.Sync"),
        keepConnectionAlive: true,
        // forward slashes only: a Windows path with backslashes matches no entity files
        entities: [(__dirname + "/Database/Table/**/*.{ts,js}").replace(/\\/g, "/")],
        logger: "advanced-console",
        logging: _ConfigService.get("Database.LOG"),
        bigNumberStrings: false,
        supportBigNumbers: true,
        dateStrings: true,
        timezone: "local",
      }),
      inject: [ConfigService],
    }),
    PassportModule.register({
      defaultStrategy: "jwt",
      session: true,
      property: "user",
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (_ConfigService: ConfigService) => ({
        secret: _ConfigService.get("JWT.SecertToken"),
        signOptions: { expiresIn: _ConfigService.get("JWT.ExpiresIn") },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    LoginController,
    UserController,
    UserRoleController,
    ErrorLogController,
    AuditLogController,
    AutoNumberController,
    WhatsappWebhookController,
    BookingController,
    WhatsappDevSendController,
    CrmWebhookController,
    CrmAdminController,
    ConsoleController,
  ],
  providers: [
    AuthService,
    UserService,
    UserRoleService,
    EmailService,
    MailerService,
    CommonService,
    JwtStrategy,
    ErrorLogService,
    AuditLogService,
    {
      provide: APP_FILTER,
      useClass: ExceptionHelper,
    },
    EncryptionService,
    CommonSeederService,
    OxxySeederService,
    WhatsappClient,
    GuardrailService,
    ClaudeService,
    ReplyValidatorService,
    ValueCheckService,
    DateWindowService,
    BookingService,
    CentreSearchService,
    ChatPipelineService,
    ConversationRepository,
    CustomerLockService,
    InboundQueueService,
    WhatsappInboundService,
    CrmClient,
    CrmOutboxService,
    CrmWebhookService,
    TriggerEngineService,
    FollowUpSchedulerService,
    SystemConfigService,
    CacheService,
    {
      provide: "REDIS_CLIENT",
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT),
          db: redisDb(),
        });
      },
    },
    CacheService,
  ],
  exports: [AuthService, EncryptionService],
})
export class AppModule {}
