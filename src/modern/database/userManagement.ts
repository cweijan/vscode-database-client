import type { DatabaseType, Dialect } from "./types";

export interface UserIdentity {
  readonly username: string;
  readonly host?: string;
}

export function userIdentity(
  username: string,
  host?: string | null,
): UserIdentity {
  const normalizedUsername = username.trim();
  const normalizedHost = host?.trim();
  if (normalizedHost) {
    return { username: normalizedUsername, host: normalizedHost };
  }
  const separator = normalizedUsername.lastIndexOf("@");
  if (separator > 0 && separator < normalizedUsername.length - 1) {
    return {
      username: normalizedUsername.slice(0, separator),
      host: normalizedUsername.slice(separator + 1),
    };
  }
  return { username: normalizedUsername };
}

export function userDisplayName(identity: UserIdentity): string {
  return identity.host ? `${identity.username}@${identity.host}` : identity.username;
}

function isMySqlFamily(type: DatabaseType): boolean {
  return type === "MySQL" || type === "MariaDB" || type === "Doris" || type === "MySQLCompatible";
}

function isPostgresFamily(type: DatabaseType): boolean {
  return type === "PostgreSQL" || type === "Redshift" || type === "Kingbase" || type === "GaussDB" || type === "Cockroach" || type === "PostgreCompatible";
}

export function userGrantSql(
  type: DatabaseType,
  dialect: Dialect,
  identity: UserIdentity,
): string | undefined {
  if (isMySqlFamily(type)) {
    return `GRANT ALL PRIVILEGES ON *.* TO ${dialect.escapeLiteral(identity.username)}@${dialect.escapeLiteral(identity.host || "%")};`;
  }
  if (isPostgresFamily(type)) {
    const role = dialect.quoteIdentifier(identity.username);
    return [
      "-- Grant select privilege;",
      `GRANT SELECT ON ALL TABLES IN SCHEMA ${dialect.quoteIdentifier("public")} TO ${role};`,
      "-- Grant all privileges;",
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${dialect.quoteIdentifier("public")} TO ${role};`,
    ].join("\n");
  }
  if (type === "Oracle" || type === "DM") {
    return `GRANT DBA TO ${dialect.quoteIdentifier(identity.username)};`;
  }
  return undefined;
}

export function userDropSql(
  type: DatabaseType,
  dialect: Dialect,
  identity: UserIdentity,
): string {
  if (isMySqlFamily(type)) {
    return `DROP USER ${dialect.escapeLiteral(identity.username)}@${dialect.escapeLiteral(identity.host || "%")};`;
  }
  return `DROP USER ${dialect.quoteIdentifier(identity.username)};`;
}

export function userDetailsSql(
  type: DatabaseType,
  dialect: Dialect,
  identity: UserIdentity,
): string | undefined {
  if (isMySqlFamily(type)) {
    return `SELECT USER, HOST, Super_priv, Select_priv, Insert_priv, Update_priv, Delete_priv, Create_priv, Drop_priv, Index_priv, Alter_priv FROM mysql.user WHERE user = ${dialect.escapeLiteral(identity.username)};`;
  }
  if (isPostgresFamily(type)) {
    return `SELECT * FROM information_schema.table_privileges WHERE grantee = ${dialect.escapeLiteral(identity.username)};`;
  }
  if (type === "Oracle" || type === "DM") {
    return `SELECT * FROM dba_sys_privs WHERE GRANTEE = ${dialect.escapeLiteral(identity.username.toUpperCase())};`;
  }
  return undefined;
}
