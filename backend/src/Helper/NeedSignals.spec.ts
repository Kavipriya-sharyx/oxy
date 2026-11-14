import { singleExpenseSignal } from "./NeedSignals";

describe("singleExpenseSignal", () => {
  it.each([
    "My father needs knee surgery next month",
    "I have a cataract operation planned in December",
    "Mera hernia ka operation hone wala hai",
    "पापा का घुटने का ऑपरेशन अगले महीने है",
  ])("%s -> one upcoming expense", (t) => expect(singleExpenseSignal(t)).toBe(true));

  it.each([
    "My mother has diabetes and needs regular checkups",
    "He had surgery last year, now needs physiotherapy",
    "I need help with medical bills",
  ])("%s -> not", (t) => expect(singleExpenseSignal(t)).toBe(false));
});
