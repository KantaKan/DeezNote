import { app } from "./app";
import { config } from "./config";

app.listen({ port: config.port, hostname: config.hostname });

console.log(`DeezNote API listening at ${app.server?.url}`);
