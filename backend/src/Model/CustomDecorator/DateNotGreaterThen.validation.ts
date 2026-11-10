import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { DateComparison } from "@Helper/Common.helper";

export function IsDateNotGreaterThen(Field: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [
        {
          Field: Field,
        },
      ],
      validator: DateNotGreaterThenValidation,
    });
  };
}
@ValidatorConstraint({ async: true })
export class DateNotGreaterThenValidation implements ValidatorConstraintInterface {
  async validate(start_date: string, args: ValidationArguments) {
    if (args.object[args.constraints[0].Field]) {
      return DateComparison(new Date(start_date), new Date(args.object[args.constraints[0].Field]));
    } else {
      return true;
    }
  }
}
