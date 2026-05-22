export const COPILOT_GET_APP_MAP_DESCRIPTION =
  "Return the current AMS app map: modules, list routes, create form ids, route patterns, required capabilities, and how to open forms. Use before guessing a route or form id.";

export const COPILOT_NAVIGATE_TO_ROUTE_DESCRIPTION =
  "Navigate the AMS browser to a relative route. Call get_app_map first when the route is not already known. Use only for navigation without opening a form; use open_form for create forms.";

export const COPILOT_NAVIGATE_ROUTE_PARAMETER_DESCRIPTION =
  "Safe relative AMS route beginning with /. Alias arg 'route' is also accepted.";

export const COPILOT_OPEN_FORM_DESCRIPTION =
  "Open an AMS create form by form_id. Call get_app_map to discover supported form ids, route requirements, scoped forms, and required capabilities. This action handles navigation and modal opening.";

export const COPILOT_OPEN_FORM_ID_PARAMETER_DESCRIPTION =
  "Create form id returned by get_app_map.supportedOpenFormIds or get_app_map.forms[].formId. Alias arg 'formId' is also accepted.";
