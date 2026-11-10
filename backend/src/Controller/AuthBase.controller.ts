import { ResponseEnum } from "@Helper/Enum/ResponseEnum";
export class AuthBaseController {
  SendResponse(Type: ResponseEnum, Message: ResponseEnum | string, AddtionalReponse: any = null) {
    if (AddtionalReponse) {
      return { Type, Message, AddtionalData: AddtionalReponse };
    } else {
      return { Type, Message };
    }
  }

  SendResponseData(ResponseData: any) {
    return ResponseData;
  }

  SendErrorResponse(e: any) {
    throw new Error(e.message);
  }
}
