import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import compression from "compression";
import errorHandler from "errorhandler";
import { urlencoded } from "express";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import passport from "passport";
import { ExceptionHelper } from "./Helper/Exception.helper";
import { CommonSeederService } from "./Database/Seeds/CommonSeeder.service";
import { ConfigService } from "@nestjs/config";
import { NestExpressApplication } from "@nestjs/platform-express";
import { json } from "express";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    cors: { origin: "*", exposedHeaders: "*" },
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.use(compression());
  app.use(errorHandler());
  app.use(urlencoded({ limit: "500mb", extended: true }));
  app.use(
    json({
      limit: "500mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  ); // rawBody is needed for the WhatsApp signature check
  app.use(passport.initialize());

  // app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new ExceptionHelper());
  const config = new DocumentBuilder()
    .setTitle("Boiler Plate")
    .addBearerAuth()
    .setDescription("BoilerPlate API Description")
    .setVersion("1.0")
    .setExternalDoc("Postman Collection", "/swagger-json")
    .setContact("BoilerPlate", "https://Demo", "Demo@Demo")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("swagger", app, document, {
    swaggerOptions: { tagsSorter: "alpha", enableSearch: true },
  });
  const _ConfigService = app.get(ConfigService);
  await app.listen(_ConfigService.get<number>("Port") || 8000);
  if (_ConfigService.get("Database.Seed") == "true") {
    const _CommonSeederService = app.get(CommonSeederService);
    await _CommonSeederService.Run();
  }
}
bootstrap();
