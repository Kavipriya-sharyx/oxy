import { createParamDecorator } from "@nestjs/common";
import { format, differenceInDays } from "date-fns";
import "reflect-metadata";

export const CurrentUser = createParamDecorator((data, req) => {
  if (req.getArgs()[0].user.user_id) {
    return req.getArgs()[0].user.user_id;
  } else {
    return 0;
  }
});

export const RandomValue = (min: any, max: any) => {
  return Math.floor(Math.random() * (max - min) + min);
};

export const DateFormatForDB = (SourceDate: Date | null) => {
  if (SourceDate) {
    SourceDate = new Date(SourceDate);
    let FormattedDate = "";
    if (SourceDate?.getDate()) {
      FormattedDate = format(SourceDate, "yyyy-MM-dd");
    }
    return FormattedDate;
  } else {
    return null;
  }
};

export const DBDateTimeStart = (SourceDate: Date | null) => {
  if (SourceDate) {
    let FormattedDate;
    if (SourceDate?.getDate()) {
      SourceDate.setHours(0);
      SourceDate.setMinutes(0);
      SourceDate.setSeconds(0);
      SourceDate.setMilliseconds(0);
      FormattedDate = format(SourceDate, "yyyy-MM-dd HH:mm");
    }
    return FormattedDate;
  } else {
    return null;
  }
};

export const DBDateTimeEnd = (SourceDate: Date | null) => {
  if (SourceDate) {
    let FormattedDate;
    if (SourceDate?.getDate()) {
      SourceDate.setHours(23);
      SourceDate.setMinutes(59);
      SourceDate.setSeconds(59);
      SourceDate.setMilliseconds(0);
      FormattedDate = format(SourceDate, "yyyy-MM-dd HH:mm");
    }
    return FormattedDate;
  } else {
    return null;
  }
};

export const DateFormatForReport = (SourceDate: Date | null) => {
  if (SourceDate) {
    let FormattedDate = "";
    if (SourceDate?.getDate()) {
      FormattedDate = format(SourceDate, "dd-MMM-yyyy");
    }
    return FormattedDate;
  } else {
    return null;
  }
};

export const DateComparison = (StartDate: Date, EndDate: Date) => {
  if (StartDate && EndDate) {
    if (differenceInDays(EndDate, StartDate) < 0) {
      return false;
    } else {
      return true;
    }
  } else {
    return true;
  }
};

export const SetLastDateOfMonth = (StartDate: Date) => {
  StartDate = new Date(StartDate);
  StartDate.setMonth(StartDate.getMonth() + 1);
  StartDate.setDate(StartDate.getDate() - 1);
  return DateFormatForDB(StartDate);
};

export const EmptyUuid = "00000000-0000-0000-0000-00000000000";
