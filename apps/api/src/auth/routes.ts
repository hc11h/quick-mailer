import { Router } from "express";
import { registerRequestHandler, registerVerifyHandler, loginRequestHandler, loginVerifyHandler, forgotRequestHandler, forgotVerifyHandler } from "./controller.js";

export const authRouter = Router();

authRouter.post("/register/request", registerRequestHandler);
authRouter.post("/register/verify", registerVerifyHandler);
authRouter.post("/login/request", loginRequestHandler);
authRouter.post("/login/verify", loginVerifyHandler);
authRouter.post("/forgot/request", forgotRequestHandler);
authRouter.post("/forgot/verify", forgotVerifyHandler);
