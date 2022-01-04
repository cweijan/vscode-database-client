import * as fs from "fs";
import { Node } from "@/model/interface/node";
import { ClickHouse } from "clickhouse";
import { IConnection, queryCallback } from "./connection";
import { EventEmitter } from "events";

/**
 * https://www.npmjs.com/package/pg
 */
export class ClickHouseConnection extends IConnection {
  private client: ClickHouse;
  constructor(node: Node) {
    super();
    if (node.useConnectionString) {
      this.client = new ClickHouse(node.connectionUrl);
      return;
    }

    let chConfig = {
      url: node.host,
      port: node.port,
      debug: false,
      basicAuth: {
        username: node.user,
        password: node.password
      },
      isUseGzip: false,
      format: "json", // "json" || "csv" || "tsv"
      raw: false,
      config: {
        session_id: node.connectTimeout || null,
        session_timeout: node.connectTimeout || 5000,
        output_format_json_quote_64bit_integers: 0,
        enable_http_compression: 0,
        database: node.database
      },
      reqParams: {}
    };
    this.client = new ClickHouse(chConfig);
  }
  isAlive(): boolean {
    const temp = this.client as any;
    return !this.dead && temp._connected && !temp._ending && temp._queryable;
  }
  query(sql: string, callback?: queryCallback): void;
  query(sql: string, values: any, callback?: queryCallback): void;
  query(sql: any, values?: any, callback?: any) {
    if (!callback && values instanceof Function) {
      callback = values;
    }
    const event = new EventEmitter();
    this.client.query(sql, (err, res) => {
      if (err) {
        if (callback) callback(err);
        this.end();
        event.emit("error", err.message);
      } else if (!callback) {
        if (res.rows.length == 0) {
          event.emit("end");
        }
        for (let i = 1; i <= res.rows.length; i++) {
          const row = res.rows[i - 1];
          event.emit("result", this.convertToDump(row), res.rows.length == i);
        }
      } else {
        if (res instanceof Array) {
          callback(
            null,
            res.map((row) => this.adaptResult(row)),
            res.map((row) => row.fields)
          );
        } else {
          callback(null, this.adaptResult(res), res.fields);
        }
      }
    });
    return event;
  }

  adaptResult(res: any) {
    // if (
    //   res.command == "DELETE" ||
    //   res.command == "UPDATE" ||
    //   res.command == "INSERT"
    // ) {
    //   return { affectedRows: res.rowCount };
    // }
    // if (res.command != "SELECT" && res.command != "SHOW") {
    //   if (res.rows && res.rows instanceof Array) {
    //     return res.rows;
    //   }
    // }
    // return res.rows;
  }

  connect(callback: (err: Error) => void): void {
    // this.client.connect((err) => {
    //   callback(err);
    //   if (!err) {
    //     this.client.on("error", this.end);
    //     this.client.on("end", this.end);
    //   }
    // });
  }
  async beginTransaction(callback: (err: Error) => void) {
    this.client.query("BEGIN", callback);
  }
  async rollback() {
    await this.client.query("ROLLBACK");
  }
  async commit() {
    await this.client.query("COMMIT");
  }
  end(): void {
    this.dead = true;
    // this.client.end();
  }
}
