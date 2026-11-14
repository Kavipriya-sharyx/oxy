export enum CrmAction {
  UpsertCustomer = "upsert_customer",
  CreateBookingRequest = "create_booking_request",
  ConfirmBooking = "confirm_booking",
  CreateTask = "create_task",
  CreateActivation = "create_activation",
  SetOptOut = "set_opt_out",
  LogEvent = "log_event", // Full Plan 3.2: trigger fired, consent changed, conversation summary
  SetOptIn = "set_opt_in", // [CONFIRM] the CRM endpoint name with the CRM team
  SetCallbackWindow = "set_callback_window", // [CONFIRM] the customer chose a callback time (Trigger O)
}
