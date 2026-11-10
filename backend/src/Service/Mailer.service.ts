import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import handlebars from "handlebars";
import path from "path";
import fs from "fs";
import utils from "util";
import { Attachment } from "nodemailer/lib/mailer";
const readFile = utils.promisify(fs.readFile);

interface SendMailData {
  to: string;
  subject: string;
  template: string;
  context: {};
  html: boolean;
  bcc?: string[];
  attachments?: Attachment[] | undefined;
}

// SMTP settings now come from env (the email_config table was removed).
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  async SendMail(_SendMailData: SendMailData) {
    try {
      const user = process.env.SMTP_USER;
      if (!user || !process.env.SMTP_PASS) {
        this.logger.error("Email not configured (SMTP_USER / SMTP_PASS).");
        return { status: false, message: "Email not configured yet." };
      }
      const smtpTransport = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        auth: { user, pass: process.env.SMTP_PASS },
      });
      const mail: any = {
        from: { name: process.env.SMTP_FROM_NAME || "Oxxy", address: user },
        to: _SendMailData.to,
        subject: _SendMailData.subject,
        bcc: _SendMailData.bcc,
        attachments: _SendMailData.attachments,
      };
      if (_SendMailData.template && _SendMailData.html) {
        const MailTemplatePath = path.resolve(
          `dist/Assets/MailTemplate/${_SendMailData.template}.hbs`,
        );
        const ContentResult = await readFile(MailTemplatePath, "utf8");
        const Template = handlebars.compile(ContentResult, { strict: true });
        mail["html"] = Template(_SendMailData.context);
      } else {
        mail["text"] = _SendMailData.template;
      }
      return await new Promise<{ status: boolean; message: string }>((resolve) => {
        smtpTransport.sendMail(mail, (error: any) => {
          smtpTransport.close();
          if (error) {
            this.logger.error(error);
            resolve({ status: false, message: JSON.stringify(error) });
          } else {
            resolve({ status: true, message: "Message has been sent" });
          }
        });
      });
    } catch (e) {
      return { status: false, message: e.message };
    }
  }
}
