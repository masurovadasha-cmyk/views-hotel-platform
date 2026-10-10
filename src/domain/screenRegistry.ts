export const guestScreens=[
"welcome","sms","search","map","apartment","booking","guest-data","payment","secure-processing","payment-declined","booking-confirmed","booking-details","cancellation-refund","services","service-request","concierge","notifications","reviews-favorites","help","profile"
] as const;

export const hostScreens=["listing-wizard","calendar-pricing","bookings","calendar-sync","host-finance"] as const;
export const staffWebScreens=["dashboard","schedule","guest360","immigration-registration","finance-invoices","service-orders","housekeeping-maintenance"] as const;
export const staffMobileScreens=["my-tasks","task-detail","proof","create-task","notifications"] as const;
export const adminScreens=["moderation","disputes-refunds","roles-rbac","integrations"] as const;

export const canvaParity={
 guest:guestScreens.length,
 host:hostScreens.length,
 staffWeb:staffWebScreens.length,
 staffMobile:staffMobileScreens.length,
 admin:adminScreens.length
};
