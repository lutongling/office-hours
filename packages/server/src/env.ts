import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { without } from "lodash";

const KEYS = [
  "NODE_ENV",
  "PUBLICKEY",
  "PRIVATEKEY",
  "EMAIL",
  "TWILIOACCOUNTSID",
  "TWILIOAUTHTOKEN",
  "TWILIOPHONENUMBER",
  "COOKIE_PASSWORD",
] as const;
type KeyUnion = typeof KEYS[number];
type Env = Record<KeyUnion, string>;

const shouldUseDevEnv =
  process.env.NODE_ENV !== "production" &&
  !fs.existsSync(path.resolve(__dirname, "../.env"));
dotenv.config({
  path: path.resolve(
    __dirname,
    shouldUseDevEnv ? "../.env.development" : "../.env"
  ),
});

const missing = without(KEYS, ...Object.keys(process.env));

if (missing.length > 0) {
  throw new Error(`Missing keys in environment: ${missing}`);
}

export const env = Object.assign({}, process.env) as Env;
