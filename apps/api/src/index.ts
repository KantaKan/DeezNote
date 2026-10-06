import { app } from "./app";
import { config } from "./config";
import { deleteExpiredSessions } from "./services/session";

app.listen({ port: config.port, hostname: config.hostname });

// Expired sessions are also removed at every sign-in; this hourly sweep keeps the Privacy Policy's promise on quiet days.
const sweepSessions = () => void deleteExpiredSessions().catch((error) => console.error("session cleanup failed", error));
sweepSessions();
setInterval(sweepSessions, 60 * 60 * 1000);

console.log(`DeezNote API listening at ${app.server?.url}`);
