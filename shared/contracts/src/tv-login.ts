export type TvLoginPairingStatus = 'pending' | 'approved' | 'expired' | 'consumed';

export type StartTvLoginResponse = {
  pairingId: string;
  status: 'pending';
  userCode: string;
  approveUrl: string;
  approvePath: string;
  pollToken: string;
  pollIntervalSeconds: number;
  expiresAt: string;
};

export type PollTvLoginResponse =
  | { status: 'pending'; pollIntervalSeconds: number; expiresAt: string }
  | { status: 'expired'; expiresAt: string }
  | { status: 'consumed' }
  | {
      status: 'approved';
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: {
        id: string;
        accountId: string;
        email: string;
        displayName: string;
        profileId: string | null;
        roles: string[];
      };
    };

export type ApproveTvLoginResponse = {
  status: 'approved';
  pairingId: string;
  deviceName: string;
  expiresAt: string;
};
