import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";

export function IsMultipleOfNumber(Field: number, validationOptions?: ValidationOptions) {
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
      validator: MultipleOfNumberThenValidation,
    });
  };
}
@ValidatorConstraint({ async: true })
export class MultipleOfNumberThenValidation implements ValidatorConstraintInterface {
  async validate(numb: number, args: ValidationArguments) {
    if (Number(args.constraints[0].Field)) {
      if (Number(numb)) {
        return Number(numb) % Number(args.constraints[0].Field) == 0;
      } else {
        return false;
      }
    } else {
      return true;
    }
  }
}
