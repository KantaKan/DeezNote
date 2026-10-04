import { app } from "./app";
import { config } from "./config";

app.listen(config.port);

console.log(`DeezNote API listening at ${app.server?.url}`);
