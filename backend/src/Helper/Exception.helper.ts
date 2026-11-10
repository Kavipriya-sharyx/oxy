import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Response } from "express";
import { error_log } from "@Database/Table/Admin/error_log";
import { ResponseEnum } from "./Enum/ResponseEnum";
import { EmptyUuid } from "./Common.helper";

@Catch()
export class ExceptionHelper implements ExceptionFilter {
  async catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    let MessageText: string = "";
    if (exception.code == "ER_DUP_ENTRY") {
      MessageText = "Duplicate record";
    } else if (exception.message?.includes("ER_DUP_ENTRY")) {
      MessageText = "Duplicate record";
    } else if (exception.code == "ER_ROW_IS_REFERENCED") {
      MessageText = "Cannot delete or update used record";
    } else if (exception.message?.includes("ER_ROW_IS_REFERENCED")) {
      MessageText = "Cannot delete or update used record";
    } else if (exception.code == "ER_NO_REFERENCED_ROW_2") {
      var matches = exception.message.match("FOREIGN KEY (.*?) REFERENCES");
      MessageText = `${matches[1].replace("(`", "").replace("`)", "")} is invalid`;
    } else if (exception.message?.includes("ER_NO_REFERENCED_ROW_2")) {
      var matches = exception.message.match("FOREIGN KEY (.*?) REFERENCES");
      MessageText = `${matches[1].replace("(`", "").replace("`)", "")} is invalid`;
    } else {
      if (Array.isArray(exception.response?.message)) {
        MessageText = exception.response.message.join("\n");
      } else if (exception.response?.message) {
        MessageText = exception.response.message;
      } else if (exception.message) {
        MessageText = exception.message;
      } else {
        MessageText = exception.response;
      }
    }
    await error_log.insert({
      url: response.req.url,
      ipaddress: response.req.ip,
      message: MessageText,
      created_by_id: (response.req as any)?.user?.["user_id"] ?? EmptyUuid,
      created_by_name: (response.req as any)?.user?.["email"] ?? "No User",
      created_on: new Date(),
    });
    response.json({ Type: ResponseEnum.Error, Message: MessageText }).status(500);
  }
}
