import CryptoJS from "crypto-js";
import { ValueTransformer } from "typeorm";

// AES-encrypts health details before they reach the database (key: SECERT_KEY).
// Stored as "enc:<base64>". Old plain values are returned as they are.
const key = () => String(process.env.SECERT_KEY ?? "");

export const encrypted: ValueTransformer = {
  to: (value?: string | null) =>
    value == null || value === "" ? value : "enc:" + CryptoJS.AES.encrypt(String(value), key()).toString(),
  from: (value?: string | null) => {
    if (value == null || !value.startsWith("enc:")) return value;
    return CryptoJS.AES.decrypt(value.slice(4), key()).toString(CryptoJS.enc.Utf8);
  },
};
