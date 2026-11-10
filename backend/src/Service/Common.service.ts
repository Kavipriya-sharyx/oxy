import { ModuleTypeEnum } from "@Helper/Enum/ModuleTypeEnum";
import { Injectable } from "@nestjs/common";
import fs from "fs";
import path from "path";
@Injectable()
export class CommonService {
  async TransactionRunningNumber(ModuleType: ModuleTypeEnum) {
    const ModuleNumberData: any = {};
    const LastNumber: string = "1";
    // if (ModuleType == ModuleTypeEnum.Quotation) {
    //   ModuleNumberData = await getManager().query(`SELECT qo_number AS module_number FROM quotation ORDER BY DATE(created_on) DESC, id DESC, CAST(REGEXP_REPLACE(qo_number,'[^0-9]','0') as unsigned) DESC LIMIT 1`);
    //   if (ModuleNumberData.length > 0) {
    //     return this.AutoGenerateNumber(ModuleNumberData[0].module_number)
    //   }
    //   else {
    //     return "1";
    //   }
    // }
  }

  RoundDecimal(value: number, scale: number = 2) {
    return Number(value.toFixed(scale));
  }

  GetBase64(FilePath: string) {
    const bitmap = fs.readFileSync(path.resolve(FilePath), "base64");
    return bitmap;
  }

  AutoGenerateNumber(value: string) {
    const last_charater = value.charAt(value.length - 1);
    const parsedvalue = parseInt(last_charater);
    if (parsedvalue == null || parsedvalue == undefined || isNaN(parsedvalue)) {
      value = value + "0";
    }
    return this.InvoiceAutoGenerateNext(value);
  }

  private InvoiceAutoGenerateNext(invoiceNumber: string) {
    const array = invoiceNumber.split(/[_/:\/\W/;\\]+/);
    const lastSegment = array.pop() || "";
    const priorSegment = invoiceNumber.substring(0, invoiceNumber.lastIndexOf(lastSegment));
    const nextNumber = this.alphaNumericIncrementer(lastSegment);
    return priorSegment + nextNumber;
  }

  private alphaNumericIncrementer(str: string) {
    if (str && str.length > 0) {
      let invNum = str.replace(/([^a-z0-9]+)/gi, "");
      invNum = invNum.toUpperCase();
      let index = invNum.length - 1;
      while (index >= 0) {
        if (invNum.substring(index, index + 1) === "9") {
          if (Number(invNum.substring(0, index)) > 0 || invNum.substring(0, index) == "") {
            invNum =
              (invNum.substring(0, index) ? invNum.substring(0, index) : "1") +
              "0" +
              invNum.substring(index + 1);
          } else {
            invNum =
              (invNum.substring(0, index)
                ? invNum.substring(0, index) +
                  (!(Number(invNum.substring(index - 1, index)) >= 0) ? "1" : "")
                : "1") +
              "0" +
              invNum.substring(index + 1);
          }
        } else if (invNum.substring(index, index + 1) === "Z") {
          invNum = invNum.substring(0, index) + "A" + invNum.substring(index + 1);
        } else {
          const char = String.fromCharCode(invNum.charCodeAt(index) + 1);
          if (Number(char) >= 0) {
            invNum = invNum.substring(0, index) + char + invNum.substring(index + 1);
          }
          index = 0;
        }
        index--;
      }
      return invNum;
    } else {
      throw new Error("str cannot be empty");
    }
  }
}
