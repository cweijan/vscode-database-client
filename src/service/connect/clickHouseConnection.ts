import * as fs from "fs";
import { Node } from "@/model/interface/node";
import ClickHouse from "@apla/clickhouse";
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
      host: node.host,
      port: node.port,
      debug: false,
      user: node.user,
      password: node.password,
      format: "JSON", // "json" || "csv" || "tsv"
      queryOptions: {
        database: node.database
      }
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
    let totalRows = 0;
    const stream = this.client.query(sql, (err, result) => {
      totalRows = result.rows;
    });
    let filds = null;
    stream.on("metadata", (columns) => {
      filds = columns;
      /* do something with column list */
    });

    let rows = [];
    stream.on("data", (row) => {
      rows.push(row);
      event.emit("result", row, rows.length == totalRows);
    });

    stream.on("error", (err) => {
      if (err) {
        if (callback) callback(err);
        this.end();
        event.emit("error", err.message);
      }
    });

    stream.on("end", () => {
      if (rows.length == 0) {
        callback(null, [], filds);
        event.emit("end");
      } else {
        callback(null, this.adaptResult(rows), filds);
      }
    });

    return event;
  }

  adaptResult(res: any) {
    return res;
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
    const stream = this.client.query("select 1");

    this.client.ping((error, result) => {
      if (!error) {
        this.end();
        callback(null);
      }
    });

    // stream.on("data", (row) => {
    //   callback(null);
    // });

    // stream.on("error", (err) => {
    //   if (!err) {
    //     this.end();
    //   }
    // });

    // stream.on("end", this.end);
    // this.client.connect((err) => {
    //   callback(err);
    //   if (!err) {
    //     this.client.on("error", this.end);
    //     this.client.on("end", this.end);
    //   }
    // });
  }
  async beginTransaction(callback: (err: Error) => void) {
    // this.client.query("BEGIN", callback);
  }
  async rollback() {
    // await this.client.query("ROLLBACK");
  }
  async commit() {
    // await this.client.query("COMMIT");
  }
  end(): void {
    this.dead = true;
    // this.client.end();
  }
}
