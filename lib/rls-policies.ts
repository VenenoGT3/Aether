/**
 * Pure functions mirroring Supabase RLS policies for unit testing.
 * Keep in sync with supabase/migrations/*.sql
 */

export function canUpdateProfile(uid: string, profileUserId: string): boolean {
  return uid === profileUserId;
}

export function canReadCampaign(
  uid: string,
  businessId: string,
  status: string
): boolean {
  return uid === businessId || status !== "draft";
}

export function canInsertCampaign(
  uid: string,
  businessId: string,
  role: string
): boolean {
  return uid === businessId && (role === "business" || role === "admin");
}

export function canUpdateCampaign(uid: string, businessId: string): boolean {
  return uid === businessId;
}

export function canReadParticipation(
  uid: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return uid === influencerId || uid === campaignBusinessId;
}

export function canInsertParticipation(
  uid: string,
  influencerId: string,
  role: string
): boolean {
  return uid === influencerId && role === "influencer";
}

export function canDeleteAppliedParticipation(
  uid: string,
  influencerId: string,
  status: string
): boolean {
  return uid === influencerId && status === "applied";
}

export function canReadPost(
  uid: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return canReadParticipation(uid, influencerId, campaignBusinessId);
}

export function canInsertPost(uid: string, influencerId: string): boolean {
  return uid === influencerId;
}

export function canReadTransaction(
  uid: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return canReadParticipation(uid, influencerId, campaignBusinessId);
}

export function canInsertEscrowTransaction(
  uid: string,
  campaignBusinessId: string
): boolean {
  return uid === campaignBusinessId;
}

export function canReadOwnNotification(uid: string, userId: string): boolean {
  return uid === userId;
}