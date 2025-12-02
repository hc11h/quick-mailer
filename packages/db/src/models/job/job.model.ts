import { model } from "mongoose";
import { JobSchema } from "./job.schema.js";

export const JobModel = model("Job", JobSchema);
