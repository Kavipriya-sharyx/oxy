import { Injectable } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { DataSource } from "typeorm";
import * as jsonDiff from "json-diff";
import { InfluxDB, Point } from "@influxdata/influxdb-client";
import { EventNameEnum, LogActionEnum } from "@Helper/Enum/AuditLogEnum";
import { AuditLogLazyLoadModel, AuditLogModel } from "@Model/Admin/AuditLog.model";
import {
  AuditLogChangeTableReferenceName,
  AuditLogIdentityName,
  AuditLogRemoveColumnsName,
  AuditLogRemoveColumnsNameByTable,
  AuditLogSameTableReferenceName,
} from "@Helper/AuditLog.decorators";
import { audit_log } from "@Root/Database/Table/Admin/audit_log";

@Injectable()
export class AuditLogService {
  private RemoveColumnsName = AuditLogRemoveColumnsName;
  private RemoveColumnsNameByTable = AuditLogRemoveColumnsNameByTable;
  private SameReferenceColumn = AuditLogSameTableReferenceName;
  private LogTableIdentifierName = AuditLogIdentityName;
  private ChangeTableReferenceName = AuditLogChangeTableReferenceName;
  private DB = new InfluxDB({
    url: process.env.INFLUX_URL,
    token: process.env.INFLUX_TOKEN,
  });
  private writeApi = this.DB.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET);
  private queryApi = this.DB.getQueryApi(process.env.INFLUX_ORG);

  constructor(
    private _EventEmitter: EventEmitter2,
    private _DataSource: DataSource,
  ) {}

  AuditEmitEvent(AuditLogData: AuditLogModel) {
    if (process.env.AUDIT_LOG === "true") {
      this._EventEmitter.emit(EventNameEnum.AuditLog, AuditLogData);
    }
  }

  private async GenerateQuery(
    table: string,
    action_type: LogActionEnum,
    ids: string[],
    req: any,
  ): Promise<string> {
    // Ensure the environment variable is defined
    const databaseName = process.env.DB_NAME;

    // Retrieve the user's IP address
    // const userIpAddress =
    //   req.headers['x-forwarded-for']?.split(',').shift()?.trim() || // Handle cases where the IP is forwarded
    //   req.socket?.remoteAddress ||
    //   req.ip;

    // if (!userIpAddress) {
    //   throw new Error("Unable to retrieve the user's IP address.");
    // }

    // Retrieve table columns
    let TableColumns = await this._DataSource.manager.query(`
  SELECT column_name AS columns
  FROM information_schema.columns
  WHERE table_catalog = '${databaseName}'
    AND table_name = '${table}'
    AND table_schema = 'public';
`);

    // Handle the case where no columns are found
    if (!TableColumns || TableColumns.length === 0) {
      throw new Error(`No columns found for table '${table}' in schema '${databaseName}'.`);
    }

    // Validate `RemoveColumnsName` and `RemoveColumnsByTable`
    const RemoveColumnsName = Array.isArray(this.RemoveColumnsName) ? this.RemoveColumnsName : [];
    const RemoveColumnsByTable = Array.isArray(this.RemoveColumnsNameByTable?.[table])
      ? this.RemoveColumnsNameByTable[table]
      : [];

    // Filter out invalid table columns
    TableColumns = TableColumns.filter((o: { columns: string }) => o.columns !== undefined);

    // Filter columns for JSON object
    const JsonObjectFilter = TableColumns.filter(
      (o: { columns: string }) =>
        !RemoveColumnsName.includes(o.columns) && !RemoveColumnsByTable.includes(o.columns),
    );

    // Handle empty JsonObjectFilter case
    if (JsonObjectFilter.length === 0) {
      throw new Error(`No valid columns found for JSON object generation for table '${table}'.`);
    }

    // Create JSON object data for all columns
    const json_object = JsonObjectFilter.map(
      (o: { columns: string }) => `'${o.columns}', COALESCE(main.${o.columns}, '')`,
    );

    const json_object_query = `json_object(${json_object.join(", ")})`;

    const tableIdentifier = this.LogTableIdentifierName?.[table];
    if (!tableIdentifier) {
      throw new Error(`LogTableIdentifierName for table '${table}' is not defined.`);
    }

    const isNestedColumn = tableIdentifier.includes(".");
    const columnName = isNestedColumn ? tableIdentifier.split(".")[1] : tableIdentifier;
    const DynamicQuery = `
    SELECT
        main.id AS performed_module_id,
        '${table}' AS performed_type,
        '${action_type}' AS performed_action,
        ${tableIdentifier} AS performed_module_name,
        '${columnName}' AS performed_module_header_name,
        ${json_object_query} AS performed_parameter,
        COALESCE(main.updated_by_id, main.created_by_id) AS performed_by_id,
        COALESCE(main.updated_on, main.created_on) AS performed_on,
        COALESCE(
            NULLIF(CONCAT(usr.first_name, ' ', COALESCE(usr.last_name, '')), ' '),
            usr.email
        ) AS performed_by,
        '1' AS performed_ipaddress,
        '11f' AS performed_coordinates
    FROM
        ${table} AS main
    LEFT JOIN
        "user" AS usr
    ON usr.id = COALESCE(main.updated_by_id, main.created_by_id)
    WHERE
        main.id IN (${ids.map((id) => `'${id}'::uuid`).join(",")});
`;

    return DynamicQuery;
  }

  private async GetLastAddedLog(PerformedType: string, PrimaryId: string): Promise<any> {
    try {
      const GetLastEventLog = new Promise((resolve, reject) => {
        const result: any = [];
        const observerdata = {
          next(row, tableMeta) {
            const o = tableMeta.toObject(row);
            result.push({
              performed_action: o.performed_action,
              performed_by: o.performed_by,
              performed_by_id: o.performed_by_id,
              performed_module_name: o.performed_module_name,
              performed_module_header_name: o.performed_module_header_name,
              performed_module_id: o.performed_module_id,
              performed_on: o.performed_on,
              performed_type: o.performed_type,
              performed_ipaddress: o.performed_ipaddress,
              performed_coordinates: o.performed_coordinates,
              performed_parameter: JSON.parse(o._value),
            });
          },
          error(error) {
            reject(error);
          },
          complete() {
            resolve(result[0] || null);
          },
        };
        const startdate: Date = new Date();
        startdate.setFullYear(startdate.getFullYear() - 100);
        const query = `
          from(bucket: "${process.env.INFLUX_BUCKET}")
          |> range(start: ${startdate.toISOString()}, stop: ${new Date().toISOString()})
          |> filter(fn: (r) => r["_measurement"] == "${process.env.INFLUX_DB}")
          |> filter(fn: (r) => r["performed_type"] == "${PerformedType}")
          |> filter(fn: (r) => r["performed_module_id"] == "${PrimaryId}")
          |> group()
          |> sort(columns: ["performed_on"], desc: true)
          |> limit(n: 1)
        `;
        this.queryApi.queryRows(query, observerdata);
      });

      return await GetLastEventLog;
    } catch (e) {
      throw new Error(e);
    }
  }

  @OnEvent(EventNameEnum.AuditLog, { async: true })
  private async Insert(AuditLogData: AuditLogModel, req: any) {
    try {
      if (AuditLogData.ActionType === LogActionEnum.Delete) {
        for (const DeletedRecordId of AuditLogData.PrimaryId) {
          const LastUpdatedOrInserted = await this.GetLastAddedLog(
            AuditLogData.PerformedType,
            DeletedRecordId,
          );
          if (LastUpdatedOrInserted) {
            for (const key of Object.keys(LastUpdatedOrInserted["performed_parameter"])) {
              if (typeof LastUpdatedOrInserted["performed_parameter"][key] === "object") {
                LastUpdatedOrInserted["performed_parameter"][key] =
                  LastUpdatedOrInserted["performed_parameter"][key]?.__new;
              }
            }
            const dataPoint = new Point(process.env.INFLUX_DB)
              .tag("performed_by", LastUpdatedOrInserted.performed_by)
              .tag("performed_by_id", LastUpdatedOrInserted.performed_by_id)
              .tag("performed_on", new Date().toISOString())
              .tag("performed_module_name", LastUpdatedOrInserted.performed_module_name)
              .tag(
                "performed_module_header_name",
                LastUpdatedOrInserted.performed_module_header_name,
              )
              .tag("performed_module_id", LastUpdatedOrInserted.performed_module_id)
              .tag("performed_type", LastUpdatedOrInserted.performed_type)
              .tag("performed_action", LogActionEnum.Delete)
              .tag("performed_ipaddress", LastUpdatedOrInserted.performed_ipaddress)
              .stringField(
                "performed_parameter",
                JSON.stringify(LastUpdatedOrInserted.performed_parameter),
              );

            // Write the point to InfluxDB and flush
            this.writeApi.writePoint(dataPoint);
            await this.writeApi.flush();

            //Insert to mysql
            const LogData = {
              performed_by: LastUpdatedOrInserted.performed_by,
              performed_by_id: LastUpdatedOrInserted.performed_by_id,
              performed_on: new Date().toISOString(),
              performed_module_name: LastUpdatedOrInserted.performed_module_name,
              performed_module_header_name: LastUpdatedOrInserted.performed_module_header_name,
              performed_module_id: LastUpdatedOrInserted.performed_module_id,
              performed_type: LastUpdatedOrInserted.performed_type,
              performed_action: LogActionEnum.Delete,
              performed_ipaddress: LastUpdatedOrInserted.performed_ipaddress,
              performed_parameter: JSON.stringify(LastUpdatedOrInserted.performed_parameter),
              created_by_id: LastUpdatedOrInserted.performed_by_id,
            };

            // Save to MySQL
            try {
              await audit_log.save(LogData);
              console.log("Audit log saved to MySQL successfully.");
            } catch (error) {
              console.error("Error saving audit log to MySQL:", error.message);
            }
          } else {
            console.log("Step break: No log found for Deleted Record ID:", DeletedRecordId);
            break;
          }
        }
      }
      // Handle Update action
      else if (AuditLogData.ActionType === LogActionEnum.Update) {
        const ResultData = await this._DataSource.manager.query(
          `${await this.GenerateQuery(AuditLogData.PerformedType, AuditLogData.ActionType, AuditLogData.PrimaryId, req)}`,
        );

        for (const Result of ResultData) {
          // Convert performed_parameter to a valid JSON string if it's an object
          if (typeof Result.performed_parameter === "object") {
            Result.performed_parameter = JSON.stringify(Result.performed_parameter);
          }

          // Validate performed_parameter before parsing
          if (typeof Result.performed_parameter !== "string") {
            console.error(
              "performed_parameter is not a valid JSON string:",
              Result.performed_parameter,
            );
            throw new Error("Invalid performed_parameter format");
          }

          // Parse performed_parameter safely
          let parsedParameter: any;
          try {
            parsedParameter = JSON.parse(Result.performed_parameter);
          } catch (error) {
            console.error("Error parsing performed_parameter:", error, Result.performed_parameter);
            throw new SyntaxError("Invalid JSON in performed_parameter");
          }

          // Get the last inserted/updated log for comparison
          const LastUpdatedOrInserted = await this.GetLastAddedLog(
            Result.performed_type,
            Result.performed_module_id,
          );

          if (LastUpdatedOrInserted) {
            // Adjust performed parameters to reflect new values
            for (const key of Object.keys(LastUpdatedOrInserted["performed_parameter"])) {
              if (typeof LastUpdatedOrInserted["performed_parameter"][key] === "object") {
                LastUpdatedOrInserted["performed_parameter"][key] =
                  LastUpdatedOrInserted["performed_parameter"][key]?.__new;
              }
            }

            // Find the differences between the last and current log
            const diffRecord = jsonDiff.diff(
              LastUpdatedOrInserted.performed_parameter,
              parsedParameter,
              { full: true },
            );

            if (diffRecord) {
              // Process and format the differences
              for (const key of Object.keys(diffRecord)) {
                if (typeof diffRecord[key] === "object") {
                  if (diffRecord[key] === null) {
                    diffRecord[key] = "";
                  } else if (!diffRecord[key]["__old"]) {
                    diffRecord[key]["__old"] = "";
                  }
                }
              }
              Result.performed_parameter = JSON.stringify(diffRecord);
            } else {
              console.log("No changes detected, skipping update log");
              break;
            }
          }

          // Create InfluxDB data point for Update
          const dataPoint = new Point(process.env.INFLUX_DB)
            .tag("performed_by", Result.performed_by)
            .tag("performed_by_id", Result.performed_by_id)
            .tag("performed_on", new Date(Result.performed_on).toISOString())
            .tag("performed_module_name", Result.performed_module_name)
            .tag("performed_module_header_name", Result.performed_module_header_name)
            .tag("performed_module_id", Result.performed_module_id)
            .tag("performed_type", Result.performed_type)
            .tag("performed_action", Result.performed_action)
            .tag("performed_ipaddress", Result.performed_ipaddress)
            .stringField("performed_parameter", Result.performed_parameter);

          // Write the point to InfluxDB and flush
          this.writeApi.writePoint(dataPoint);
          await this.writeApi.flush();

          // Insert to MySQL DB
          const LogData = {
            performed_by: Result.performed_by,
            performed_by_id: Result.performed_by_id,
            performed_on: new Date(Result.performed_on).toISOString(),
            performed_module_name: Result.performed_module_name,
            performed_module_header_name: Result.performed_module_header_name,
            performed_module_id: Result.performed_module_id,
            performed_type: Result.performed_type,
            performed_action: Result.performed_action,
            performed_ipaddress: Result.performed_ipaddress,
            performed_parameter: Result.performed_parameter,
            created_by_id: Result.performed_by_id,
            created_on: new Date(Result.performed_on).toISOString(),
          };

          try {
            await audit_log.save(LogData);
            console.log("Audit log saved to MySQL successfully.");
          } catch (error) {
            console.error("Error saving audit log to MySQL:", error.message);
          }
        }
      }
      // Handle Insert action
      else if (AuditLogData.ActionType === LogActionEnum.Insert) {
        const ResultData = await this._DataSource.manager.query(
          `${await this.GenerateQuery(AuditLogData.PerformedType, AuditLogData.ActionType, AuditLogData.PrimaryId, req)}`,
        );

        for (const Result of ResultData) {
          // const dataPoint = new Point(process.env.INFLUX_DB)
          //   .tag("performed_by", Result.performed_by)
          //   .tag("performed_by_id", Result.performed_by_id)
          //   .tag("performed_on", new Date(Result.performed_on).toISOString())
          //   .tag("performed_module_name", Result.performed_module_name)
          //   .tag(
          //     "performed_module_header_name",
          //     Result.performed_module_header_name
          //   )
          //   .tag("performed_module_id", Result.performed_module_id)
          //   .tag("performed_type", Result.performed_type)
          //   .tag("performed_action", Result.performed_action)
          //   .tag("performed_ipaddress", Result.performed_ipaddress)
          //   .stringField(
          //     "performed_parameter",
          //     JSON.stringify(Result.performed_parameter)
          //   );

          // // Write the point to InfluxDB and flush
          // this.writeApi.writePoint(dataPoint);
          // await this.writeApi.flush();
          // Insert to MySQL DB
          const LogData = {
            performed_by: Result.performed_by,
            performed_by_id: Result.performed_by_id,
            performed_on: new Date(Result.performed_on).toISOString(),
            performed_module_name: Result.performed_module_name,
            performed_module_header_name: Result.performed_module_header_name,
            performed_module_id: Result.performed_module_id,
            performed_type: Result.performed_type,
            performed_action: Result.performed_action,
            performed_ipaddress: Result.performed_ipaddress,
            performed_parameter: Result.performed_parameter,
            created_by_id: Result.performed_by_id,
            created_on: new Date(Result.performed_on).toISOString(),
          };
          try {
            await audit_log.save(LogData);
            console.log("Audit log saved to MySQL successfully.");
          } catch (error) {
            console.error("Error saving audit log to MySQL:", error.message);
          }
        }
      }
    } catch (e) {
      console.error("Error in Insert method:", e);
    }
  }

  async LazyLoadList(AuditLogLazyLoadData: AuditLogLazyLoadModel) {
    const WhereCondition: string[] = [];
    const searchKey =
      AuditLogLazyLoadData.keyword?.length || 0 > 0 ? AuditLogLazyLoadData.keyword : "";
    WhereCondition["performed_on"] = {
      $gte: AuditLogLazyLoadData.start_date,
      $lt: AuditLogLazyLoadData.end_date,
    };
    if (AuditLogLazyLoadData.user_id > "0") {
      WhereCondition.push(
        `|> filter(fn: (r) => r["performed_by_id"] == "${AuditLogLazyLoadData.user_id}")`,
      );
    }
    if (AuditLogLazyLoadData.action?.length > 0) {
      WhereCondition.push(
        `|> filter(fn: (r) => r["performed_action"] == "${AuditLogLazyLoadData.action}")`,
      );
    }
    if (AuditLogLazyLoadData.module?.length > 0) {
      WhereCondition.push(
        `|> filter(fn: (r) => r["performed_type"] == "${AuditLogLazyLoadData.module}")`,
      );
    }
    if (searchKey) {
      WhereCondition.push(
        `|> filter(fn: (r) => strings.containsStr(v : strings.toLower(v : r["performed_module_name_string"]), substr: strings.toLower(v : "${searchKey}")))`,
      );
    }
    const GetEventLogList = await new Promise((resolve, reject) => {
      const result: any = [];
      const observerdata = {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          result.push({
            performed_action: o.performed_action,
            performed_by: o.performed_by,
            performed_by_id: o.performed_by_id,
            performed_module_name: o.performed_module_name,
            performed_module_header_name: o.performed_module_header_name,
            performed_module_id: o.performed_module_id,
            performed_on: new Date(o.performed_on).toLocaleString(),
            performed_type: o.performed_type,
            performed_ipaddress: o.performed_ipaddress,
            performed_coordinates: o.performed_coordinates,
            performed_parameter: JSON.parse(o._value),
          });
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve(result);
        },
      };

      const query = `
  import "strings"
  from(bucket: "${process.env.INFLUX_BUCKET}")
      |> range(start: ${new Date(AuditLogLazyLoadData.start_date).toISOString()}, stop: ${new Date(AuditLogLazyLoadData.end_date).toISOString()})
      |> filter(fn: (r) => r["_measurement"] == "${process.env.INFLUX_DB}")
      |> filter(fn: (r) => r["_field"] == "performed_parameter")
      |> fill(column: "performed_module_name", value: "")
      |> map(fn: (r) => ({ r with performed_module_name_string: string(v: r.performed_module_name) }))
      ${WhereCondition.join("\n")}
      |> group()
      |> sort(columns: ["performed_on"], desc: true)
      |> limit(n: ${AuditLogLazyLoadData.take}, offset: ${AuditLogLazyLoadData.skip})
`;

      this.queryApi.queryRows(query, observerdata);
    });
    const GetEventLogCount = await new Promise((resolve, reject) => {
      let total_count: number = 0;
      const observercount = {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          total_count = o._value;
        },
        error(error) {
          reject(error);
        },
        complete() {
          resolve(total_count);
        },
      };
      const countquery = `
  import "strings"
  from(bucket: "${process.env.INFLUX_BUCKET}")
      |> range(start: ${new Date(AuditLogLazyLoadData.start_date).toISOString()}, stop: ${new Date(AuditLogLazyLoadData.end_date).toISOString()})
      |> filter(fn: (r) => r["_measurement"] == "${process.env.INFLUX_DB}")
      |> fill(column: "performed_module_name", value: "")
      |> map(fn: (r) => ({ r with performed_module_name_string: string(v: r.performed_module_name) }))
      ${WhereCondition.join("\n")}
      |> group()
      |> count(column: "_value")
`;
      this.queryApi.queryRows(countquery, observercount);
    });
    const Result: any = {};
    Result["data"] = GetEventLogList;
    Result["total_record"] = GetEventLogCount;
    return Result;
  }

  async DetailList(EventLog: any) {
    const BooleanColumns = ["is_", "status"];
    EventLog["audit_log_events"] = [];
    for (const AuditLogEvents of Object.keys(EventLog.performed_parameter).filter(
      (o) => !AuditLogRemoveColumnsName.includes(o),
    )) {
      if (
        EventLog.performed_action == LogActionEnum.Insert ||
        EventLog.performed_action == LogActionEnum.Delete
      ) {
        if (typeof EventLog.performed_parameter[AuditLogEvents] == "object") {
          if (AuditLogEvents == EventLog.performed_module_header_name) {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} to <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents]?.__old == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]?.__old} </b>`,
            );
          } else {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} of <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents]?.__old == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]?.__old} </b>`,
            );
          }
        } else {
          if (AuditLogEvents == EventLog.performed_module_header_name) {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} to <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents] == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]}</b>`,
            );
          } else {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} of <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents] == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]}</b>`,
            );
          }
        }
      } else {
        if (typeof EventLog.performed_parameter[AuditLogEvents] == "object") {
          if (AuditLogEvents == EventLog.performed_module_header_name) {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} to <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents]?.__old == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]?.__old}</b> to <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents]?.__new == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]?.__new}</b>`,
            );
          } else {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} of <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents]?.__old == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]?.__old}</b> to <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents]?.__new == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]?.__new}</b>`,
            );
          }
        } else {
          if (AuditLogEvents == EventLog.performed_module_header_name) {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} to <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents] == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]}</b>`,
            );
          } else {
            EventLog["audit_log_events"].push(
              `User <b>${EventLog.performed_by}</b> ${EventLog.performed_action.toUpperCase()} a  <b>${EventLog.performed_type.split("_").join(" ")}</b> ${AuditLogEvents.split("_").join(" ")} of <b>${BooleanColumns.some((o) => AuditLogEvents.includes(o)) ? (EventLog.performed_parameter[AuditLogEvents] == 1 ? "Yes" : "No") : EventLog.performed_parameter[AuditLogEvents]}</b>`,
            );
          }
        }
      }
    }
    return EventLog;
  }

  GetColumneName(table: string, columns: string) {
    let tablename: string = "";
    if (!this.ChangeTableReferenceName[table]) {
      tablename = columns.replace("_id", "");
    } else if (this.ChangeTableReferenceName[table][1]?.find((f) => f.includes(columns))) {
      tablename = this.ChangeTableReferenceName[table][0].table;
    } else {
      tablename = columns.replace("_id", "");
    }
    return this.LogTableIdentifierName[tablename]?.replace("main.", "");
  }

  GetTableName(table: string, columns: string) {
    let tablename = "";
    if (!this.ChangeTableReferenceName[table]) {
      tablename = columns.replace("_id", "");
    } else if (this.ChangeTableReferenceName[table][1]?.find((f) => f.includes(columns))) {
      tablename = this.ChangeTableReferenceName[table][0].table;
    } else {
      tablename = columns.replace("_id", "");
    }
    return tablename;
  }
}
