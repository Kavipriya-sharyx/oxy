import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import CryptoJS from "crypto-js";

@Injectable()
export class EncryptionService {
  constructor(private _ConfigService: ConfigService) {}
  Decrypt(text: string) {
    const DuplicateKey = CryptoJS.enc.Hex.parse(text);
    const OriginalKey = DuplicateKey.toString(CryptoJS.enc.Base64);
    return CryptoJS.AES.decrypt(
      OriginalKey,
      String(this._ConfigService.get("Encryption.SecertKey")),
    ).toString(CryptoJS.enc.Utf8);
  }

  Encrypt(text: string) {
    const OriginalKey = CryptoJS.AES.encrypt(
      text,
      String(this._ConfigService.get("Encryption.SecertKey")),
    ).toString();
    const DuplicateKey = CryptoJS.enc.Base64.parse(OriginalKey);
    return DuplicateKey.toString(CryptoJS.enc.Hex);
  }
}
