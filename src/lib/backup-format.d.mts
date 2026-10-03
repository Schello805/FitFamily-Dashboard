import type { Client } from "@libsql/client";
export function encryptDatabase(content: Uint8Array, secret: string): Buffer;
export function decryptDatabase(content: Uint8Array, secret: string): Buffer;
export function verifyDatabase(filename: string, requireFitFamily?: boolean): Promise<void>;
export function sanitizeRecoveredDatabase(filename: string): Promise<void>;
export function snapshotDatabase(databaseUrl: string, destination: string): Promise<void>;
export function recoverDatabase(content: Uint8Array, secret: string, destination: string): Promise<string>;
export function readBackupConfiguration(client: Client, environment?: NodeJS.ProcessEnv): Promise<{ target: string | null; secret: string | null }>;
