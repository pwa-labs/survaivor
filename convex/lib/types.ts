export type IntegratorScopedIdentityResponse = {
  integrator: {
    id: string;
    slug: string;
    name: string;
  };
  subject?: {
    type: "human" | "agent" | "organization";
    id: string;
    identifier: string;
    profile:
      | {
          did: string;
          publicName?: string;
          status: "unclaimed" | "claimed" | "revoked";
          owner:
            | {
                type: "human";
                id: string;
                name: string;
                handle?: string;
                identityVerificationStatus: "verified" | "not_verified";
              }
            | {
                type: "organization";
                id: string;
                name: string;
                handle?: string;
              }
            | null;
        }
      | {
          handle?: string;
          firstName?: string;
          lastName?: string;
          identityVerificationStatus: "verified" | "not_verified";
        }
      | {
          handle?: string;
          legalName?: string;
          domain?: string;
        }
      | null;
  };
  score:
    | {
        score: number;
        laneScores: {
          origin: number;
          presence: number;
          conduct: number;
        };
        updatedAt: number;
      }
    | null;
  integratorScore:
    | {
        score: number;
        laneScores: {
          origin: number;
          presence: number;
          conduct: number;
        };
        environmentCount: number;
        updatedAt: number;
      }
    | null;
  metricBreakdown: Array<{
    environmentId: string;
    metricKey: string;
    totalEvents: number;
    weightedContribution: number;
    lastEventAt: number;
  }>;
  contextKey: string;
};
