/**
 * Pure functions mirroring Supabase RLS policies.
 * Keep in sync with supabase/migrations/*.sql
 */

export type UserRole = "business" | "influencer" | "admin";

// --- users ---

export function canReadOwnUser(uid: string, targetUserId: string): boolean {
  return uid === targetUserId;
}

export function canUpdateOwnUser(uid: string, targetUserId: string): boolean {
  return uid === targetUserId;
}

export function canChangeUserRole(
  actorRole: UserRole,
  oldRole: UserRole,
  newRole: UserRole
): boolean {
  if (oldRole === newRole) return true;
  return actorRole === "admin";
}

// --- profiles ---

export function canUpdateProfile(uid: string, profileUserId: string): boolean {
  return uid === profileUserId;
}

export function canInsertProfile(uid: string, profileUserId: string): boolean {
  return uid === profileUserId;
}

/**
 * Scoped profile read: own row, influencer discovery, or shared campaign relationship.
 */
export function canReadProfile(
  viewerId: string,
  profileUserId: string,
  profileRole: UserRole,
  hasSharedParticipation: boolean
): boolean {
  if (viewerId === profileUserId) return true;
  if (hasSharedParticipation) return true;
  if (profileRole === "influencer") return true;
  return false;
}

// --- campaigns ---

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
  role: UserRole
): boolean {
  return uid === businessId && (role === "business" || role === "admin");
}

export function canUpdateCampaign(uid: string, businessId: string): boolean {
  return uid === businessId;
}

export function canDeleteCampaign(uid: string, businessId: string): boolean {
  return uid === businessId;
}

// --- participations ---

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
  role: UserRole
): boolean {
  return uid === influencerId && role === "influencer";
}

export function canUpdateParticipation(
  uid: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return uid === influencerId || uid === campaignBusinessId;
}

export function canDeleteAppliedParticipation(
  uid: string,
  influencerId: string,
  status: string
): boolean {
  return uid === influencerId && status === "applied";
}

// --- posts ---

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

export function canUpdatePostRow(
  uid: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return canReadPost(uid, influencerId, campaignBusinessId);
}

export function canApprovePost(
  uid: string,
  campaignBusinessId: string,
  role: UserRole
): boolean {
  return uid === campaignBusinessId || role === "admin";
}

export function canModifyPostDetails(
  uid: string,
  influencerId: string,
  role: UserRole
): boolean {
  return uid === influencerId || role === "admin";
}

export function canDeletePost(uid: string, influencerId: string): boolean {
  return uid === influencerId;
}

// --- transactions ---

export function canReadTransaction(
  uid: string,
  influencerId: string,
  campaignBusinessId: string,
  transactionUserId?: string | null
): boolean {
  if (transactionUserId && uid === transactionUserId) return true;
  return canReadParticipation(uid, influencerId, campaignBusinessId);
}

export function canInsertBusinessTransaction(
  uid: string,
  campaignBusinessId: string,
  transactionUserId: string | null
): boolean {
  if (uid !== campaignBusinessId) return false;
  return transactionUserId === null || transactionUserId === uid;
}

export function canInsertPayoutTransaction(
  uid: string,
  transactionUserId: string,
  type: string
): boolean {
  return type === "payout" && uid === transactionUserId;
}

// --- notifications ---

export function canReadOwnNotification(uid: string, userId: string): boolean {
  return uid === userId;
}

export function canUpdateOwnNotification(uid: string, userId: string): boolean {
  return uid === userId;
}

export function canDeleteOwnNotification(uid: string, userId: string): boolean {
  return uid === userId;
}

export function canInsertNotification(
  senderId: string,
  recipientUserId: string,
  campaignBusinessId: string,
  participationInfluencerId: string
): boolean {
  if (senderId === recipientUserId) return true;
  if (
    senderId === campaignBusinessId &&
    recipientUserId === participationInfluencerId
  ) {
    return true;
  }
  if (
    senderId === participationInfluencerId &&
    recipientUserId === campaignBusinessId
  ) {
    return true;
  }
  return false;
}

// --- ratings ---

export function canReadRating(
  viewerId: string,
  reviewerId: string,
  revieweeId: string,
  viewerIsCampaignParticipant: boolean
): boolean {
  return (
    viewerId === reviewerId ||
    viewerId === revieweeId ||
    viewerIsCampaignParticipant
  );
}

export function canInsertRating(
  reviewerId: string,
  authUid: string,
  isCampaignParticipant: boolean
): boolean {
  return authUid === reviewerId && isCampaignParticipant;
}

// --- messages ---

export function canReadMessage(
  uid: string,
  senderId: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return (
    uid === senderId ||
    canReadParticipation(uid, influencerId, campaignBusinessId)
  );
}

export function canInsertMessage(
  uid: string,
  senderId: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return (
    uid === senderId &&
    canReadParticipation(uid, influencerId, campaignBusinessId)
  );
}

export function canUpdateMessageReadStatus(
  uid: string,
  influencerId: string,
  campaignBusinessId: string
): boolean {
  return canReadParticipation(uid, influencerId, campaignBusinessId);
}

export function canMutateMessageContent(): boolean {
  return false;
}