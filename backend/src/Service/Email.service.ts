import { Injectable } from "@nestjs/common";
import { MailerService } from "./Mailer.service";
import { CommonService } from "./Common.service";

@Injectable()
export class EmailService {
  constructor(
    private readonly _MailerService: MailerService,
    private readonly _CommonService: CommonService,
  ) {}

  async ForgotPassword(EmailId: string, ResetOTP: number, EncryptedUserId: string) {
    const Res = await this._MailerService.SendMail({
      to: EmailId,
      subject: "Forgot password request",
      template: "ForgotPassword",
      html: true,
      attachments: [
        {
          filename: "logo.png",
          content: this._CommonService.GetBase64(`dist/Assets/Logo.png`),
          cid: "logo",
          encoding: "base64",
        },
      ],
      context: {
        logo: "cid:logo",
        domain_name: process.env.DOMAIN_NAME + "ResetPassword/" + EncryptedUserId,
        otp: ResetOTP,
      },
    });
    return Res;
  }
}
