import { Injectable } from "@nestjs/common";
import { error_log } from "@Database/Table/Admin/error_log";
import { ErrorLogDeleteModel, ErrorLogLazyLoadModel } from "@Model/Admin/ErrorLog.model";
import { DataSource, LessThanOrEqual } from "typeorm";

@Injectable()
export class ErrorLogService {
  constructor(private _DataSource: DataSource) {}

  async LazyLoadList(ErrorLogLazyLoadData: ErrorLogLazyLoadModel) {
    const queryBuilder = this._DataSource.manager.createQueryBuilder(error_log, "el");
    queryBuilder
      .select(["el.*", "SUM(1) OVER() AS total_count"])
      .where("el.created_on BETWEEN :start_date AND :end_date", {
        start_date: ErrorLogLazyLoadData.start_date,
        end_date: ErrorLogLazyLoadData.end_date,
      });
    queryBuilder.andWhere("el.created_by_id = :user_id", {
      user_id: ErrorLogLazyLoadData.user_id,
    });
    queryBuilder.orderBy("el.created_on", "DESC");
    queryBuilder.limit(ErrorLogLazyLoadData.take).offset(ErrorLogLazyLoadData.skip);
    return await queryBuilder.getRawMany();
  }

  async DeleteByAsOfDate(ErrorLogDeleteData: ErrorLogDeleteModel) {
    if (ErrorLogDeleteData.password == "Login@321!!") {
      await error_log.delete({ created_on: LessThanOrEqual(ErrorLogDeleteData.as_of_date) });
    } else {
      throw new Error("Password incorrect");
    }
  }
}
