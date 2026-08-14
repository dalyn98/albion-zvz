// One operator action must stay bounded even when a tenant has accumulated an
// abnormal backlog. Keep the UI warning and server-side budget on one value.
export const APPROVE_ALL_PENDING_LIMIT = 200
