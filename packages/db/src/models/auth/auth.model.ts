import { model } from "mongoose";
import { AuthCodeSchema, UserSchema } from "./auth.schema.js";

export const AuthCodeModel = model("AuthCode", AuthCodeSchema);
export const UserModel = model("User", UserSchema);
