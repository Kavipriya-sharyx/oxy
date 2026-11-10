export const AuditLogRemoveColumnsName = [];
export const AuditLogRemoveColumnsNameByTable = {};
export const AuditLogSameTableReferenceName = {};
export const AuditLogChangeTableReferenceName = {};
export const AuditLogIdentityName = {};

export const AuditLogRemoveColumn = () => {
  return function (target: any, propertyKey: string) {
    AuditLogRemoveColumnsName.push(propertyKey);
  };
};

export const AuditLogTableRemoveColumns = () => {
  return function (target: any, propertyKey: string) {
    if (!AuditLogRemoveColumnsNameByTable[target.constructor.name]) {
      AuditLogRemoveColumnsNameByTable[target.constructor.name] = [];
    }
    AuditLogRemoveColumnsNameByTable[target.constructor.name].push(propertyKey);
  };
};

export function AuditLogSameTableReference(ReferenceTableName: string) {
  return function (target: any, propertyKey: string) {
    if (!AuditLogSameTableReferenceName[target.constructor.name]) {
      AuditLogSameTableReferenceName[target.constructor.name] = [{ table: ReferenceTableName }];
      AuditLogSameTableReferenceName[target.constructor.name][1] = [];
    }
    AuditLogSameTableReferenceName[target.constructor.name][1].push(propertyKey);
  };
}

export function AuditLogIdentity(ReferenceTableName: string = "main.", ISPorperty: boolean = true) {
  return function (target: any, propertyKey: string) {
    if (!AuditLogIdentityName[target.constructor.name]) {
      AuditLogIdentityName[target.constructor.name] = "";
    }
    AuditLogIdentityName[target.constructor.name] =
      ReferenceTableName + (ISPorperty ? propertyKey : "");
  };
}

export function AuditLogChangeTableReference(ReferenceTableName: string) {
  return function (target: any, propertyKey: string) {
    if (!AuditLogChangeTableReferenceName[target.constructor.name]) {
      AuditLogChangeTableReferenceName[target.constructor.name] = [{ table: ReferenceTableName }];
      AuditLogChangeTableReferenceName[target.constructor.name][1] = [];
    }
    AuditLogChangeTableReferenceName[target.constructor.name][1].push(propertyKey);
  };
}
