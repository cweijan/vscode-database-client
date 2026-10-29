import { existsSync, readFileSync } from "node:fs";

import type { ConnectionOptions } from "./types";
import { connectionOption } from "./connectionOptions";

function option(options: ConnectionOptions, key: string): unknown {
  return connectionOption(options, key);
}

function textOption(options: ConnectionOptions, key: string): string | undefined {
  const value = option(options, key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readCertificate(value: string): string {
  return existsSync(value) ? readFileSync(value, "utf8") : value;
}

/**
 * Converts the connection-page SSL fields into the TLS shape understood by
 * mysql2, pg, Redis, and other Node drivers. Certificate fields are paths in
 * the persisted connection, but Node TLS expects their contents.
 */
export function buildSslOptions(options: ConnectionOptions): unknown {
  const configured = option(options, "ssl");
  const useSsl = option(options, "useSSL");
  const caPath = textOption(options, "caPath");
  const clientCertPath = textOption(options, "clientCertPath");
  const clientKeyPath = textOption(options, "clientKeyPath");
  const hasMaterial = Boolean(caPath || clientCertPath || clientKeyPath);

  if (configured === undefined && useSsl !== true && !hasMaterial) {
    return undefined;
  }
  if (configured === false && !hasMaterial) {
    return undefined;
  }
  if (configured !== null && typeof configured === "object" && !Array.isArray(configured)) {
    const result: Record<string, unknown> = { ...(configured as Record<string, unknown>) };
    if (caPath) result.ca = readCertificate(caPath);
    if (clientCertPath) result.cert = readCertificate(clientCertPath);
    if (clientKeyPath) result.key = readCertificate(clientKeyPath);
    if (option(options, "disableTLSVerification") !== undefined) {
      result.rejectUnauthorized = !Boolean(option(options, "disableTLSVerification"));
    }
    return result;
  }
  if (hasMaterial || option(options, "disableTLSVerification") !== undefined) {
    const result: Record<string, unknown> = {};
    if (caPath) result.ca = readCertificate(caPath);
    if (clientCertPath) result.cert = readCertificate(clientCertPath);
    if (clientKeyPath) result.key = readCertificate(clientKeyPath);
    result.rejectUnauthorized = !Boolean(option(options, "disableTLSVerification"));
    return result;
  }
  return configured === undefined ? true : configured;
}

export function sslPathOption(
  options: ConnectionOptions,
  key: "caPath" | "clientCertPath" | "clientKeyPath",
): string | undefined {
  return textOption(options, key);
}
